/**
 * Whether leaving asks what happens to your frames (13.2): not with none, and
 * not on a closed roll, whose photos are already gone.
 */
export const asksAboutFrames = (frameCount: number, closed: boolean) => !closed && frameCount > 0;
