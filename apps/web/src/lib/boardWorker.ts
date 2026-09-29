import { generateBoard, type BoardRef } from '@puzzle-hustle/core';

self.onmessage = (e: MessageEvent<{ id: number; ref: BoardRef }>) => {
  const { id, ref } = e.data;
  try {
    self.postMessage({ id, spec: generateBoard(ref) });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
