// Public API of @operations-hub/domain.
// Only what React and Angular will need is exported; internal helpers stay
// private (deep imports are blocked by the package.json "exports" map).

export type {
  Dataset,
  Project,
  ProjectStatus,
  Report,
  ReportMetrics,
  ReportScope,
  Task,
  TaskPriority,
  TaskStatus,
  Team,
  User,
} from './types'

export type { FieldErrors } from './validation'
export {
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TITLE_LENGTH,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  validateProjectInput,
  validateTaskInput,
  validateTeamInput,
  validateUserInput,
} from './validation'
export type {
  ProjectInput,
  ProjectValidationContext,
  TaskInput,
  TaskValidationContext,
  TeamInput,
  UserInput,
  UserValidationContext,
} from './validation'

export {
  isEmailUnique,
  isProjectOwnerInTeam,
  projectHasValidOwnerAndTeam,
  taskAssigneeIsValid,
  taskBelongsToProject,
  userBelongsToExistingTeam,
  validateDataset,
} from './rules'

export {
  canTransitionProject,
  canTransitionTask,
  PROJECT_TRANSITIONS,
  TASK_TRANSITIONS,
} from './transitions'

export {
  buildGlobalReport,
  buildProjectReport,
  buildTeamReport,
  computeCompletionRate,
  computeTaskCounts,
} from './reports'
export type { TaskCounts } from './reports'

export { FIXTURE_VERSION, loadFixture } from './fixture'
