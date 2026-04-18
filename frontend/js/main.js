import { mountAuthFeature } from "./features/auth/index.js";
import { mountAssignmentFeature } from "./features/assignments/index.js";
import { mountSchedulerFeature } from "./features/scheduler/index.js";
import { mountTimerFeature } from "./features/timer/index.js";

mountAuthFeature(document.getElementById("auth-card"));
mountAssignmentFeature(document.getElementById("assignments-card"));
mountSchedulerFeature(document.getElementById("scheduler-card"));
mountTimerFeature(document.getElementById("timer-card"));
