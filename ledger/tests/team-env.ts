// Import this first in a test file: the team root, skills directory and lock are read when modules load.
// The fixture team makes roles, skills and skill docs the same on every machine and over time.
import { join } from 'node:path';
const team = join(import.meta.dirname, 'fixtures/team');
process.env.AGENT_TEAM_HOME = team;
process.env.AGENT_SKILLS_DIR = join(team, 'skills');
process.env.AGENT_SKILL_LOCK = join(team, 'no-skill-lock.json');
export const teamFixture = team;
