/**
 * Luna Quilling — Google Apps Script backend
 * Public catalogue + private admin API + enquiries + Drive image storage.
 *
 * Public endpoints expose ONLY active artwork records.
 * Admin endpoints require a Google Identity Services ID token whose email is
 * exactly ADMIN_EMAIL and whose audience matches GOOGLE_CLIENT_ID in Script Properties.
 */

const SPREADSHEET_NAME = 'Luna Quilling - Enquiries';
const ARTWORK_FORM_NAME = 'Luna Quilling - Artwork Manager';
const ARTWORK_FOLDER_NAME = 'Luna Quilling - Artwork Images';
const REFERENCE_FOLDER_NAME = 'Luna Quilling - Customer References';
const ADMIN_EMAIL = 'lunaquilling@gmail.com';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REFERENCE_BYTES = 5 * 1024 * 1024;
const DEFAULT_STATUS = 'Active';
const ENQUIRY_STATUSES = ['New','Contacted','Quoted','Confirmed','In Progress','Completed','Cancelled'];
const ARTWORK_STATUSES = ['Active','Hidden','Archived','Deleted'];

const ARTWORK_HEADERS = [
  'Work ID','Title','Category','Description','Starting Price','Image URL','Featured','Status','Sort Order','Created Date','Updated Date'
];
const ENQUIRY_HEADERS = [
  'Enquiry ID','Date/time','Customer name','Phone','Email','Source','Enquiry type','Artwork','Size','Budget','Requirements','Reference image','Status','Notes'
];

function setupLunaQuilling() {
  const ss = getOrCreateSpreadsheet_();
  ensureSheet_(ss, 'Artworks', ARTWORK_HEADERS);
  ensureSheet_(ss, 'Enquiries', ENQUIRY_HEADERS);
  ensureSheet_(ss, 'Artwork Form Responses', []);
  getOrCreateFolder_(ARTWORK_FOLDER_NAME);
  getOrCreateFolder_(REFERENCE_FOLDER_NAME);
  const form = findOrCreateArtworkForm_(ss);
  if (form) ensureFormSubmitTrigger_(form);
  PropertiesService.getScriptProperties().setProperties({
    SPREADSHEET_ID: ss.getId(),
    ARTWORK_FORM_ID: form ? form.getId() : ''
  }, true);
  Logger.log('Spreadsheet: ' + ss.getUrl());
  Logger.log('Set GOOGLE_CLIENT_ID in Script Properties before enabling admin dashboard.');
}

/** Run once after creating your Google OAuth Web Client ID. */
function setGoogleClientId(clientId) {
  if (!clientId || String(clientId).indexOf('.apps.googleusercontent.com') === -1) throw new Error('Invalid Google OAuth client ID.');
  PropertiesService.getScriptProperties().setProperty('GOOGLE_CLIENT_ID', String(clientId).trim());
}

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || '').toLowerCase();
  try {
    if (action === 'works') return json_({ok:true, works:getActiveWorks_()});
    if (action === 'work') {
      const workId = clean_(e.parameter.workId);
      const work = getActiveWorks_().find(w => w.workId === workId);
      return json_({ok:!!work, work:work || null});
    }
    return json_({ok:true, service:'Luna Quilling API', publicActions:['works','work']});
  } catch (err) {
    console.error(err);
    return json_({ok:false,error:'Request failed.'});
  }
}

function doPost(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    const action = clean_(p.action);
    if (action === 'submitEnquiry') {
      if (clean_(p.website)) return json_({ok:true});
      return json_(saveEnquiry_(p));
    }
    if (action === 'admin') return json_(adminApi_(p));
    return json_({ok:false,error:'Invalid action.'});
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ok:false,error:err.message || 'Request failed.'});
  }
}

/**
 * Google Form submit trigger. Form question titles must match these names:
 * Work ID, Title, Category, Description, Starting Price, Artwork image,
 * Featured, Status, Sort Order.
 */
function onArtworkFormSubmit(e) {
  try {
    const itemResponses = e.response.getItemResponses();
    const data = {};
    itemResponses.forEach(ir => data[ir.getItem().getTitle()] = ir.getResponse());
    const workId = clean_(data['Work ID']) || nextWorkId_();
    let imageUrl = '';
    const upload = data['Artwork image'];
    const fileIds = Array.isArray(upload) ? upload : extractDriveFileIds_(upload);
    if (fileIds.length) imageUrl = makeArtworkPublic_(fileIds[0], workId);
    const existing = findArtwork_(workId);
    const now = new Date();
    upsertArtwork_({
      workId,
      title: clean_(data['Title']),
      category: clean_(data['Category']),
      description: clean_(data['Description']),
      startingPrice: clean_(data['Starting Price']),
      imageUrl: imageUrl || (existing ? existing.imageUrl : ''),
      featured: normalizeBool_(data['Featured']),
      status: clean_(data['Status']) || DEFAULT_STATUS,
      sortOrder: numberOrZero_(data['Sort Order']),
      createdDate: existing ? existing.createdDate : now,
      updatedDate: now
    });
  } catch (err) { console.error('Artwork form trigger failed: ' + err); }
}

function adminApi_(p) {
  verifyAdmin_(p.idToken);
  const op = clean_(p.op);
  if (op === 'bootstrap') return adminBootstrap_();
  if (op === 'saveArtwork') return adminSaveArtwork_(p);
  if (op === 'deleteArtwork') return adminDeleteArtwork_(p);
  if (op === 'updateEnquiry') return adminUpdateEnquiry_(p);
  throw new Error('Unknown admin operation.');
}

function verifyAdmin_(idToken) {
  if (!idToken) throw new Error('Google sign-in required.');
  const clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) throw new Error('Admin Google Client ID has not been configured. Run setGoogleClientId().');
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  const response = UrlFetchApp.fetch(url, {muteHttpExceptions:true});
  if (response.getResponseCode() !== 200) throw new Error('Google sign-in could not be verified.');
  const token = JSON.parse(response.getContentText());
  if (String(token.aud) !== String(clientId)) throw new Error('Google sign-in audience mismatch.');
  if (String(token.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase()) throw new Error('This Google account is not authorized for Luna Quilling admin access.');
  if (String(token.email_verified) !== 'true') throw new Error('Google email is not verified.');
  const exp = Number(token.exp || 0);
  if (!exp || exp * 1000 < Date.now()) throw new Error('Google sign-in has expired. Please sign in again.');
  return token;
}

function adminBootstrap_() {
  const ss = getOrCreateSpreadsheet_();
  const artworks = getAllArtworks_();
  const enquiries = getAllEnquiries_();
  const stats = {
    totalArtworks: artworks.length,
    activeArtworks: artworks.filter(x=>x.status.toLowerCase()==='active').length,
    hiddenArtworks: artworks.filter(x=>x.status.toLowerCase()==='hidden').length,
    archivedArtworks: artworks.filter(x=>x.status.toLowerCase()==='archived').length,
    featuredArtworks: artworks.filter(x=>x.featured).length,
    totalEnquiries: enquiries.length,
    newEnquiries: enquiries.filter(x=>x.status==='New').length
  };
  return {
    ok:true,
    stats,
    artworks:artworks.slice(0,500),
    enquiries:enquiries.slice(0,500),
    enquiryStatuses:ENQUIRY_STATUSES,
    artworkStatuses:ARTWORK_STATUSES,
    categories:[...new Set(artworks.map(x=>x.category).filter(Boolean))].sort(),
    spreadsheetUrl:ss.getUrl()
  };
}

function adminSaveArtwork_(p) {
  const workId = clean_(p.workId) || nextWorkId_();
  const existing = findArtwork_(workId);
  const now = new Date();
  let imageUrl = clean_(p.imageUrl);
  if (p.image) {
    const image = parseImage_(p.image, MAX_IMAGE_BYTES);
    const folder = getOrCreateFolder_(ARTWORK_FOLDER_NAME);
    const file = folder.createFile(Utilities.newBlob(image.bytes, image.mimeType, workId + '-' + sanitizeFilename_(image.name)));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    imageUrl = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(file.getId()) + '&sz=w1200';
    PropertiesService.getScriptProperties().setProperty('ARTWORK_FILE_' + workId, file.getId());
  }
  if (!imageUrl && existing) imageUrl = existing.imageUrl;
  if (!imageUrl) imageUrl = '';
  upsertArtwork_({
    workId,
    title:clean_(p.title), category:clean_(p.category), description:clean_(p.description),
    startingPrice:clean_(p.startingPrice), imageUrl,
    featured:normalizeBool_(p.featured),
    status:ARTWORK_STATUSES.includes(clean_(p.status)) ? clean_(p.status) : DEFAULT_STATUS,
    sortOrder:numberOrZero_(p.sortOrder),
    createdDate:existing ? existing.createdDate : now,
    updatedDate:now
  });
  return {ok:true, artwork:findArtwork_(workId)};
}

function adminDeleteArtwork_(p) {
  const workId=clean_(p.workId); if (!workId) throw new Error('Work ID is required.');
  const existing=findArtwork_(workId); if (!existing) throw new Error('Artwork not found.');
  upsertArtwork_(Object.assign({}, existing, {status:'Deleted',updatedDate:new Date()}));
  return {ok:true,workId};
}

function adminUpdateEnquiry_(p) {
  const id=clean_(p.enquiryId); if (!id) throw new Error('Enquiry ID is required.');
  const sheet=ensureSheet_(getOrCreateSpreadsheet_(),'Enquiries',ENQUIRY_HEADERS);
  const row=findRowByKey_(sheet,1,id); if (row < 2) throw new Error('Enquiry not found.');
  const status=clean_(p.status); if (!ENQUIRY_STATUSES.includes(status)) throw new Error('Invalid enquiry status.');
  sheet.getRange(row,13).setValue(status);
  sheet.getRange(row,14).setValue(clean_(p.notes));
  return {ok:true,enquiry:getEnquiryByRow_(sheet,row)};
}

function upsertArtwork_(a) {
  if (!a.workId) throw new Error('Work ID is required.');
  const sheet=ensureSheet_(getOrCreateSpreadsheet_(),'Artworks',ARTWORK_HEADERS);
  const row=findRowByKey_(sheet,1,a.workId);
  const values=[a.workId,a.title,a.category,a.description,a.startingPrice,a.imageUrl,a.featured,a.status,a.sortOrder,a.createdDate || new Date(),a.updatedDate || new Date()];
  if (row >= 2) sheet.getRange(row,1,1,ARTWORK_HEADERS.length).setValues([values]);
  else sheet.appendRow(values);
}

function findArtwork_(workId) { return getAllArtworks_().find(x=>x.workId===workId) || null; }
function getActiveWorks_() { return getAllArtworks_().filter(x=>x.status.toLowerCase()==='active').sort(sortWorks_); }

function getAllArtworks_() {
  const sh=ensureSheet_(getOrCreateSpreadsheet_(),'Artworks',ARTWORK_HEADERS);
  const values=sh.getDataRange().getValues();
  return values.slice(1).filter(r=>r[0]).map(r=>({
    workId:String(r[0]),title:String(r[1]||''),category:String(r[2]||''),description:String(r[3]||''),startingPrice:String(r[4]||''),imageUrl:String(r[5]||''),featured:normalizeBool_(r[6])==='Yes',status:String(r[7]||DEFAULT_STATUS),sortOrder:numberOrZero_(r[8]),createdDate:r[9] || '',updatedDate:r[10] || ''
  }));
}

function sortWorks_(a,b){ return a.sortOrder-b.sortOrder || a.title.localeCompare(b.title); }
function getAllEnquiries_(){
  const sh=ensureSheet_(getOrCreateSpreadsheet_(),'Enquiries',ENQUIRY_HEADERS);
  const values=sh.getDataRange().getValues();
  return values.slice(1).filter(r=>r[0]).map(enquiryFromRow_).reverse();
}
function getEnquiryByRow_(sh,row){ return enquiryFromRow_(sh.getRange(row,1,1,ENQUIRY_HEADERS.length).getValues()[0]); }
function enquiryFromRow_(r){ return {enquiryId:String(r[0]),dateTime:r[1] instanceof Date?r[1].toISOString():String(r[1]||''),name:String(r[2]||''),phone:String(r[3]||''),email:String(r[4]||''),source:String(r[5]||''),type:String(r[6]||''),artwork:String(r[7]||''),size:String(r[8]||''),budget:String(r[9]||''),requirements:String(r[10]||''),referenceImage:String(r[11]||''),status:String(r[12]||'New'),notes:String(r[13]||'')}; }

function saveEnquiry_(p) {
  const name=clean_(p.name),phone=clean_(p.phone),email=clean_(p.email);
  if(!name || !phone) throw new Error('Name and phone are required.');
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email.');
  if(clean_(p.requirements).length>3000 || clean_(p.additionalRequirements).length>3000) throw new Error('Requirements are too long.');
  const sh=ensureSheet_(getOrCreateSpreadsheet_(),'Enquiries',ENQUIRY_HEADERS), id=nextEnquiryId_(sh), now=new Date();
  let ref=''; if(p.referenceImage) ref=saveReferenceImage_(p.referenceImage,id);
  const type=clean_(p.enquiryType)||'Custom Artwork';
  const requirements=[clean_(p.requirements),clean_(p.additionalRequirements)].filter(Boolean).join('\n\n');
  sh.appendRow([id,now,name,phone,email,clean_(p.source)||'Website',type,clean_(p.artwork),clean_(p.size),clean_(p.budget),requirements,ref,'New','']);
  sendAdminEmail_({id,now,name,phone,email,type,artwork:clean_(p.artwork),size:clean_(p.size),budget:clean_(p.budget),requirements,referenceUrl:ref});
  if(email) sendAcknowledgement_(email,name,type,id);
  return {ok:true,enquiryId:id};
}

function saveReferenceImage_(encoded,id){
  const image=parseImage_(encoded,MAX_REFERENCE_BYTES);
  const file=getOrCreateFolder_(REFERENCE_FOLDER_NAME).createFile(Utilities.newBlob(image.bytes,image.mimeType,id+'-'+sanitizeFilename_(image.name||'reference')));
  return file.getUrl();
}
function parseImage_(encoded,maxBytes){
  let obj; try{obj=JSON.parse(encoded);}catch(e){throw new Error('Invalid image upload.');}
  const bytes=Utilities.base64Decode(obj.data||''); if(!bytes.length) throw new Error('Empty image.'); if(bytes.length>maxBytes) throw new Error('Image is too large.');
  const allowed=['image/jpeg','image/png','image/webp']; const mime=allowed.includes(obj.mimeType)?obj.mimeType:'application/octet-stream'; if(mime==='application/octet-stream') throw new Error('Only JPG, PNG or WebP images are allowed.');
  return {bytes,mimeType:mime,name:obj.name||'image'};
}
function makeArtworkPublic_(fileId,workId){ const file=DriveApp.getFileById(fileId); file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW); PropertiesService.getScriptProperties().setProperty('ARTWORK_FILE_'+workId,fileId); return 'https://drive.google.com/thumbnail?id='+encodeURIComponent(fileId)+'&sz=w1200'; }

function nextEnquiryId_(sheet){ const ids=sheet.getLastRow()<2?[]:sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues().flat().map(String); let max=0; ids.forEach(id=>{const m=id.match(/^LQ-(\d+)$/);if(m)max=Math.max(max,Number(m[1]));}); return 'LQ-'+String(max+1).padStart(4,'0'); }
function nextWorkId_(){ const ids=getAllArtworks_().map(x=>x.workId); let max=0; ids.forEach(id=>{const m=id.match(/^LQW-(\d+)$/);if(m)max=Math.max(max,Number(m[1]));}); return 'LQW-'+String(max+1).padStart(4,'0'); }

function sendAdminEmail_(x){ MailApp.sendEmail({to:ADMIN_EMAIL,subject:`New Luna Quilling enquiry ${x.id} — ${x.name}`,body:[`New enquiry: ${x.id}`,`Date: ${x.now}`,`Customer: ${x.name}`,`Phone: ${x.phone}`,`Email: ${x.email||'(not provided)'}`,`Type: ${x.type}`,`Artwork: ${x.artwork||'(custom)'}`,`Size: ${x.size||'(not provided)'}`,`Budget: ${x.budget||'(not provided)'}`,'',x.requirements||'(no requirements)','',`Reference image: ${x.referenceUrl||'(none)'}`].join('\n')}); }
function sendAcknowledgement_(email,name,type,id){ MailApp.sendEmail({to:email,subject:'Thank you for contacting Luna Quilling',body:`Hello ${name},\n\nThank you for contacting Luna Quilling. We have received your ${/custom/i.test(type)?'custom artwork request':'artwork enquiry'} (${id}). We will review your requirements and contact you shortly.\n\nWarmly,\nRathana\nLuna Quilling\nWhatsApp: +91 72003 02709\nInstagram: https://www.instagram.com/lunaquilling/`}); }

function ensureFormSubmitTrigger_(form){ const exists=ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='onArtworkFormSubmit'); if(!exists)ScriptApp.newTrigger('onArtworkFormSubmit').forForm(form).onFormSubmit().create(); }
function findFormByName_(){ const files=DriveApp.getFilesByName(ARTWORK_FORM_NAME); while(files.hasNext()){const f=files.next();if(f.getMimeType()===MimeType.GOOGLE_FORMS)return FormApp.openById(f.getId());} return null; }
function findOrCreateArtworkForm_(ss){
  const existing=findFormByName_();
  if(existing) return existing;
  const form=FormApp.create(ARTWORK_FORM_NAME);
  form.setDescription('Private Luna Quilling artwork manager. Submit a new or corrected artwork record.');
  form.addTextItem().setTitle('Work ID').setHelpText('Leave blank to let the system generate an ID.').setRequired(false);
  form.addTextItem().setTitle('Title').setRequired(true);
  form.addTextItem().setTitle('Category').setRequired(true);
  form.addParagraphTextItem().setTitle('Description').setRequired(false);
  form.addTextItem().setTitle('Starting Price').setRequired(false);
  try { form.addFileUploadItem().setTitle('Artwork image').setHelpText('Upload one JPG, PNG or WebP image.').setRequired(false); } catch(e) { console.warn('Could not create file upload question automatically. Add it manually: '+e); }
  form.addMultipleChoiceItem().setTitle('Featured').setChoiceValues(['Yes','No']).setRequired(true);
  form.addMultipleChoiceItem().setTitle('Status').setChoiceValues(ARTWORK_STATUSES).setRequired(true);
  form.addTextItem().setTitle('Sort Order').setHelpText('0 = normal order; lower numbers appear first.').setRequired(false);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  return form;
}
function getOrCreateSpreadsheet_(){ const props=PropertiesService.getScriptProperties(),id=props.getProperty('SPREADSHEET_ID'); if(id)return SpreadsheetApp.openById(id); const files=DriveApp.getFilesByName(SPREADSHEET_NAME); if(files.hasNext()){const ss=SpreadsheetApp.openById(files.next().getId());props.setProperty('SPREADSHEET_ID',ss.getId());return ss;} const ss=SpreadsheetApp.create(SPREADSHEET_NAME);props.setProperty('SPREADSHEET_ID',ss.getId());return ss; }
function ensureSheet_(ss,name,headers){ let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);if(headers&&headers.length){const first=sh.getRange(1,1,1,headers.length).getValues()[0];if(first.every(v=>!v))sh.getRange(1,1,1,headers.length).setValues([headers]);} return sh; }
function getOrCreateFolder_(name){const it=DriveApp.getFoldersByName(name);if(it.hasNext())return it.next();return DriveApp.createFolder(name);}
function findRowByKey_(sheet,col,key){const last=sheet.getLastRow();if(last<2)return -1;const vals=sheet.getRange(2,col,last-1,1).getValues().flat();for(let i=0;i<vals.length;i++)if(String(vals[i]).trim()===String(key).trim())return i+2;return -1;}
function normalizeBool_(v){return ['yes','true','1','featured'].includes(String(v||'').toLowerCase())?'Yes':'No';}
function clean_(v){return String(v??'').trim();}
function numberOrZero_(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function sanitizeFilename_(n){return String(n).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);}
function extractDriveFileIds_(s){return String(s||'').match(/[A-Za-z0-9_-]{20,}/g)||[];}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
