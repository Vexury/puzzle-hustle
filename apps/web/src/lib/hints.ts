export interface HintProvider {
  readonly label: string;
  request(): Promise<boolean>;
}

export const freeHints: HintProvider = {
  label: 'Hint',
  async request() {
    return true;
  },
};

export function currentHintProvider(): HintProvider {
  return freeHints;
}
