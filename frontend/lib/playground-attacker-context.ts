import { createContext, useContext } from 'react';

interface AttackerContextValue {
  attackerMode: boolean;
  quantumMode:  boolean;
}

export const AttackerContext = createContext<AttackerContextValue>({
  attackerMode: false,
  quantumMode:  false,
});

export function useAttackerContext(): AttackerContextValue {
  return useContext(AttackerContext);
}
