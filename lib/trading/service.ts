import { getActivePlaybook, getCalendar, getUniverse, listLessons, listPlaybooks } from "./store";
import { DEFAULT_V2_PARAMS } from "./strategy/candidates";

/**
 * Read models + commands shared by the REST API and the trading chat.
 *
 * The sections live in their own modules; this file keeps the small views and
 * the import surface every route already uses.
 */

export * from "./service-dashboard";
export * from "./service-gates";
export * from "./service-journal";
export * from "./service-analytics";
export * from "./service-backtests";
export * from "./service-commands";

export async function getLearningView() {
  const [playbook, history, lessons] = await Promise.all([getActivePlaybook(), listPlaybooks(10), listLessons(40)]);
  return { playbook, history, lessons, defaults: DEFAULT_V2_PARAMS };
}

export async function getUniverseView() {
  const [universe, calendar] = await Promise.all([getUniverse(), getCalendar(new Date(Date.now() - 86_400_000).toISOString().slice(0, 10))]);
  return { universe, calendar };
}
