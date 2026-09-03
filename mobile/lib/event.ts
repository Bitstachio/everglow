import {
  eventsControllerCreate,
  eventsControllerFindAll,
  eventsControllerFindOne,
  eventsControllerGetParticipants,
  eventsControllerJoin,
  eventsControllerLeave,
  eventsControllerRegenerateInvitationUrl,
  eventsControllerRemove,
  eventsControllerRemoveParticipant,
  eventsControllerUpdate,
  eventsControllerUpdateParticipantAccess,
} from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import type {
  AccessLevel,
  CreateEventDto,
  EventParticipantResponseDto,
  EventResponseDto,
  JoinEventDto,
  UpdateEventDto,
} from "@/lib/api/generated";

export type {
  AccessLevel,
  CreateEventDto,
  EventParticipantResponseDto,
  EventResponseDto,
  JoinEventDto,
  UpdateEventDto,
};

export const createEvent = async (body: CreateEventDto): Promise<EventResponseDto> => {
  const { data } = await eventsControllerCreate({ body, throwOnError: true });
  return unwrapEnvelope(data);
};

export const getUserEvents = async (): Promise<EventResponseDto[]> => {
  const { data } = await eventsControllerFindAll({ throwOnError: true });
  // OpenAPI currently types `data` as a single event; runtime returns an array.
  return unwrapEnvelope(data) as unknown as EventResponseDto[];
};

export const getEventById = async (eventId: string): Promise<EventResponseDto> => {
  const { data } = await eventsControllerFindOne({ path: { eventId }, throwOnError: true });
  return unwrapEnvelope(data);
};

export const updateEvent = async (eventId: string, body: UpdateEventDto): Promise<EventResponseDto> => {
  const { data } = await eventsControllerUpdate({ path: { eventId }, body, throwOnError: true });
  return unwrapEnvelope(data);
};

export const deleteEvent = async (eventId: string): Promise<void> => {
  await eventsControllerRemove({ path: { eventId }, throwOnError: true });
};

export const joinEventByUrl = async (invitationUrl: string): Promise<EventResponseDto> => {
  const body: JoinEventDto = { invitationUrl };
  const { data } = await eventsControllerJoin({ body, throwOnError: true });
  return unwrapEnvelope(data);
};

export const leaveEvent = async (eventId: string): Promise<void> => {
  await eventsControllerLeave({ path: { eventId }, throwOnError: true });
};

export const getEventParticipants = async (eventId: string): Promise<EventParticipantResponseDto[]> => {
  const { data } = await eventsControllerGetParticipants({ path: { eventId }, throwOnError: true });
  // OpenAPI currently types `data` as a single participant; runtime returns an array.
  return unwrapEnvelope(data) as unknown as EventParticipantResponseDto[];
};

export const updateUserAccessLevel = async (
  eventId: string,
  targetUserId: string,
  accessLevel: AccessLevel,
): Promise<EventParticipantResponseDto> => {
  const { data } = await eventsControllerUpdateParticipantAccess({
    path: { eventId, targetUserId },
    body: { accessLevel },
    throwOnError: true,
  });
  return unwrapEnvelope(data);
};

export const removeUserFromEvent = async (eventId: string, targetUserId: string): Promise<void> => {
  await eventsControllerRemoveParticipant({ path: { eventId, targetUserId }, throwOnError: true });
};

export const regenerateInvitationUrl = async (eventId: string): Promise<string> => {
  const { data } = await eventsControllerRegenerateInvitationUrl({ path: { eventId }, throwOnError: true });
  return unwrapEnvelope(data).invitationUrl;
};
