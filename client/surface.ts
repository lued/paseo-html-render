/**
 * Timeline renderers do not receive navigation, so the client entry registers
 * the host's public `openScreen` once. Only public client context methods are
 * used; the navigator is cleared on plugin cleanup.
 */
import { SELECTED_IDENTITY } from "../shared/selected-identity.ts";

type OpenScreen = (input: { screenId: string; params?: Record<string, string> }) => void;

let navigate: OpenScreen | null = null;

export const REPORT_SCREEN_ID = SELECTED_IDENTITY.screenId;

export function setNavigator(open: OpenScreen | null): void {
  navigate = open;
}

/** True when the host exposed public screen navigation. */
export function canOpenReportScreen(): boolean {
  return navigate !== null;
}

export function openReportScreen(input: {
  artifactId: string;
  agentId: string;
  title: string;
}): boolean {
  const open = navigate;
  if (!open) return false;
  open({
    screenId: REPORT_SCREEN_ID,
    params: {
      artifactId: input.artifactId,
      agentId: input.agentId,
      title: input.title,
    },
  });
  return true;
}
