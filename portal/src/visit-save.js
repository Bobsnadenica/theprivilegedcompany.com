import {photoVisit} from './bulgaria-model.js';

// A photo must reach private storage before its check-in can reach the ledger.
// Keep the same draft after errors, including a lost successful ledger response.
export async function commitPhotoVisit(repository,photos,draft) {
  photoVisit(draft.change.entry);
  if (draft.upload && draft.upload.photo.id !== draft.change.entry.photo.id) throw new Error('The visit and photo do not match.');
  if (draft.upload && !draft.uploaded) {
    await photos.upload(draft.upload.photo,draft.upload.blob);
    draft.uploaded = true;
  }
  return repository.commit(draft.change);
}
