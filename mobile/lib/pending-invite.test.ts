import { clearPendingInvite, savePendingInvite, takeLandingRoute, takePendingInvite } from "./pending-invite";

afterEach(() => clearPendingInvite());

test("keeps an invite until it is taken, once", () => {
  savePendingInvite("k8Qm2");
  expect(takePendingInvite()).toBe("k8Qm2");
  expect(takePendingInvite()).toBeNull();
});

test("the latest invite wins", () => {
  savePendingInvite("first");
  savePendingInvite("second");
  expect(takePendingInvite()).toBe("second");
});

test("lands on the waiting envelope, then on Home", () => {
  savePendingInvite("k8Qm2");
  expect(takeLandingRoute()).toBe("/join/k8Qm2");
  expect(takeLandingRoute()).toBe("/events");
});

test("forgets the invite when asked", () => {
  savePendingInvite("k8Qm2");
  clearPendingInvite();
  expect(takePendingInvite()).toBeNull();
});
