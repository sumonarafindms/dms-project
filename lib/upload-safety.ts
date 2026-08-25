export const MAX_UPLOAD_BYTES=20*1024*1024;
export function validateUploadFile(file:File,extensions:string[]){
 if(file.size<=0)return "Uploaded file is empty.";
 if(file.size>MAX_UPLOAD_BYTES)return "File is too large. Maximum upload size is 20 MB.";
 const name=file.name.toLowerCase();
 if(!extensions.some(ext=>name.endsWith(ext)))return `Unsupported file type. Allowed: ${extensions.join(", ")}`;
 return null;
}
