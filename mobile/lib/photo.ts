import api from "./api";

// NOTE: The backend does not currently expose a photos controller (only
// `users` and `events` exist under /api/v2). These calls are aligned to the
// v2 prefix for consistency but will 404 until a backend photos module ships.
export type Photo = {
  id: number;
  event_id: number;
  user_id?: number;
  added_by?: number;
  image_url: string;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  uploaded_at?: string;
};

export type UploadPhotoResponse = Photo;

export const uploadPhoto = async (
  eventId: number,
  fileUri: string,
  fileName: string,
  fileType: string,
): Promise<UploadPhotoResponse> => {
  const formData = new FormData();
  formData.append("eventId", eventId.toString());

  const file = {
    uri: fileUri,
    type: fileType,
    name: fileName,
  } as any;

  formData.append("photo", file);

  const response = await api.post("/photos", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data.data;
};

export const getUserPhotos = async (): Promise<Photo[]> => {
  const response = await api.get("/photos/my-photos");
  return response.data.data;
};

export const getAllPhotosFromUserEvents = async (): Promise<Photo[]> => {
  const response = await api.get("/photos/my-events-photos");
  return response.data.data;
};

export const getPhotosByEvent = async (eventId: number): Promise<Photo[]> => {
  const response = await api.get(`/photos/event/${eventId}`);
  return response.data.data;
};

export const getEventPhotoCount = async (eventId: number): Promise<number> => {
  const response = await api.get(`/photos/event/${eventId}/count`);
  return response.data.data.count;
};

export const getPhotoById = async (photoId: number): Promise<Photo> => {
  const response = await api.get(`/photos/${photoId}`);
  return response.data.data;
};

export const deletePhoto = async (photoId: number): Promise<void> => {
  await api.delete(`/photos/${photoId}`);
};
