// Import this first in a test file: the team root, skills directory and lock are read when modules load.
// The fixture team makes roles, skills and skill docs the same on every machine and over time.
import { join } from 'node:path';
const team = join(import.meta.dirname, 'fixtures/team');
process.env.AGENT_TEAM_HOME = team;
process.env.AGENT_SKILLS_DIR = join(team, 'skills');
process.env.AGENT_SKILL_LOCK = join(team, 'no-skill-lock.json');
// The golden files were recorded at UTC+7: calendar days and hour buckets depend on the zone, so pin it for every test.
process.env.TZ = 'Asia/Ho_Chi_Minh';
export const teamFixture = team;
// Fixture repositories must not depend on the developer's Git configuration (commit signing, object format,
// templates, hooks, log options): commit ids are compared exactly, and the code under test runs git itself.
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
process.env.GIT_CONFIG_NOSYSTEM = '1';
process.env.GIT_TERMINAL_PROMPT = '0';
