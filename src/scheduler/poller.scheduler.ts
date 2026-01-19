import cron from "node-cron";
import { pollRegisterEvents } from "../poller/register.poller";
import { pollTaskId3Event } from "../poller/task3.poller";
import { pollTaskId4Event } from "../poller/task4.poller";
import { pollTaskId5Event } from "../poller/task5.poller";

export function startPollers() {
  cron.schedule("*/1 * * * *", pollRegisterEvents);
  cron.schedule("*/1 * * * *", pollTaskId3Event);
  cron.schedule("*/1 * * * *", pollTaskId4Event);
  cron.schedule("*/1 * * * *", pollTaskId5Event);
}
