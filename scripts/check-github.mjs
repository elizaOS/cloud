import { Octokit } from '@octokit/rest';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });
config({ path: '.env' });

const token = process.env.GIT_ACCESS_TOKEN || process.env.GITHUB_APP_TOKEN;
const org = process.env.GITHUB_ORG_NAME || 'elizacloud-apps';
const templateRepo = process.env.GITHUB_TEMPLATE_REPO || 'elizacloud-apps/sandbox-template';

console.log('=== GitHub Configuration Check ===');
console.log('Token:', token ? token.substring(0, 10) + '...' : 'NOT SET');
console.log('Organization:', org);
console.log('Template Repo:', templateRepo);
console.log('');

async function check() {
  if (!token) {
    console.log('ERROR: No GitHub token configured');
    return;
  }

  const octokit = new Octokit({ auth: token });

  // Check token validity and permissions
  try {
    const { data: user } = await octokit.users.getAuthenticated();
    console.log('✓ Token Valid - User:', user.login);
  } catch (e) {
    console.log('✗ ERROR: Token invalid or expired:', e.message);
    return;
  }

  // Check org access
  try {
    const { data: orgData } = await octokit.orgs.get({ org });
    console.log('✓ Organization Found:', orgData.login);
  } catch (e) {
    console.log('✗ ERROR: Cannot access organization:', e.message);
    console.log('  - Is the org name correct?');
    console.log('  - Does the token have org access?');
  }

  // Check template repo
  const [templateOwner, templateRepoName] = templateRepo.split('/');
  try {
    const { data: repoData } = await octokit.repos.get({ owner: templateOwner, repo: templateRepoName });
    console.log('✓ Template Repo Found:', repoData.full_name);
    console.log('  Is Template:', repoData.is_template ? '✓ YES' : '✗ NO - MUST BE MARKED AS TEMPLATE!');
    if (!repoData.is_template) {
      console.log('  → Go to repo Settings → check "Template repository"');
    }
  } catch (e) {
    console.log('✗ ERROR: Cannot access template repo:', e.message);
    console.log('  - Does the repo exist?');
    console.log('  - Is it accessible to the token?');
  }

  // List existing repos in org
  try {
    const { data: repos } = await octokit.repos.listForOrg({ org, per_page: 20 });
    console.log('');
    console.log('Repos in org (found', repos.length + '):');
    repos.forEach(r => console.log('  -', r.name, r.is_template ? '(template)' : ''));
  } catch (e) {
    console.log('Cannot list repos:', e.message);
  }

  // Try to check if we can create repos
  console.log('');
  console.log('=== Permission Check ===');
  try {
    const { data: membership } = await octokit.orgs.getMembershipForAuthenticatedUser({ org });
    console.log('Membership Role:', membership.role);
    console.log('Membership State:', membership.state);
  } catch (e) {
    console.log('Cannot check membership:', e.message);
  }
}

check().catch(e => console.log('Error:', e.message));
