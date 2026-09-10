export const MAX_PHOTO_INPUT = 25 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export function validateVisitPhoto(photo) {
  if (!photo || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photo.id)
      || photo.type !== 'image/jpeg' || !Number.isInteger(photo.bytes) || photo.bytes < 1 || photo.bytes > MAX_PHOTO_BYTES
      || !Number.isInteger(photo.width) || !Number.isInteger(photo.height) || photo.width < 1 || photo.height < 1
      || photo.width > 1600 || photo.height > 1600 || !/^[0-9a-f]{64}$/.test(photo.sha256)) {
    throw new Error('This visit photo cannot be read. Your saved visits have not changed.');
  }
  return photo;
}
export async function prepareVisitPhoto(file) {
  if (!file || !file.size) throw new Error('Choose a photo first.');
  if (file.size > MAX_PHOTO_INPUT) throw new Error('Choose a photo smaller than 25 MB.');
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !(file.type === '' && /\.(jpe?g|png|webp|hei[cf])$/i.test(file.name))) throw new Error('Choose a JPEG, PNG, WebP, or a phone photo.');
  const url = URL.createObjectURL(file), image = new Image();
  try {
    image.src = url;
    try { await image.decode(); } catch { throw new Error('Your browser could not open this photo. Try a JPEG or use Take photo.'); }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 65000000) throw new Error('This photo is too large to open on your phone. Choose a smaller copy.');
    const scale = Math.min(1,1600 / Math.max(image.naturalWidth,image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1,Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Could not prepare the photo. Please try again.');
    context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(image,0,0,canvas.width,canvas.height);
    // Re-encoding saves a smaller copy and omits the original GPS/EXIF metadata.
    const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));
    if (!blob || blob.size > MAX_PHOTO_BYTES) throw new Error('Could not make a smaller photo. Choose another image.');
    const bytes = await blob.arrayBuffer();
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    return {blob,photo:validateVisitPhoto({id:crypto.randomUUID(),type:'image/jpeg',bytes:blob.size,width:canvas.width,height:canvas.height,sha256})};
  } finally { URL.revokeObjectURL(url); }
}
