import events from "./events.json";
import http from "./http.json";
import images from "./images.json";
import moderation from "./moderation.json";
import photos from "./photos.json";
import plans from "./plans.json";
import rateLimit from "./rate-limit.json";
import users from "./users.json";

/** Domain catalogs for API error codes (one JSON file per API error domain). */
export const EN_ERROR_MESSAGE_DOMAINS = [http, users, events, images, plans, photos, moderation, rateLimit] as const;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export type EnErrorMessages = UnionToIntersection<(typeof EN_ERROR_MESSAGE_DOMAINS)[number]>;

const errors = Object.assign({}, ...EN_ERROR_MESSAGE_DOMAINS) as EnErrorMessages;

export default errors;
