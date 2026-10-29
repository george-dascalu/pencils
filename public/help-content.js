// Bundled guides work locally. External links are references, not loaded resources.
export const helpArticles = [
  {
    id: "start",
    title: "Help & guides",
    group: "Start here",
    summary:
      "Set up your workspace, connect project data and find your way around Pencils.",
    sections: [
      {
        id: "connect",
        title: "Bring your project together",
        html: '<p>A project can show local tasks alongside Obsidian notes, Jira Cloud issues and rows from a SharePoint Excel table. Imported tasks retain their source identity and a link to the original.</p><div class="help-cards"><a href="#help/integrations" data-action="help-article" data-id="integrations"><strong>Connect a project</strong><span>Combine sources and understand sync.</span></a><a href="#help/obsidian" data-action="help-article" data-id="obsidian"><strong>Obsidian</strong><span>Open the same vault or import a separate folder.</span></a><a href="#help/jira" data-action="help-article" data-id="jira"><strong>Jira Cloud</strong><span>Choose issues with a project-scoped query.</span></a><a href="#help/excel" data-action="help-article" data-id="excel"><strong>SharePoint Excel</strong><span>Import rows from a named Excel table.</span></a><a href="#help/miro" data-action="help-article" data-id="miro"><strong>Import from Miro</strong><span>Copy a board into an editable Pencils canvas.</span></a></div>',
      },
      {
        id: "everyday",
        title: "Everyday help",
        html: '<p>Find <a href="#help/sync" data-action="help-article" data-id="sync">sync troubleshooting</a>, <a href="#help/shortcuts" data-action="help-article" data-id="shortcuts">keyboard shortcuts and local access</a>, and <a href="#help/setup" data-action="help-article" data-id="setup">server setup</a> in the sidebar. Search looks through all guide text. Browser Back and Forward return to previous articles and project views.</p><p>These guides describe the features shipped in Pencils. Provider documentation was checked on 17 October 2026. Live consent, account permissions and Microsoft tenant policies still need verification with your own accounts.</p>',
      },
    ],
  },
  {
    id: "integrations",
    title: "Connect a project",
    group: "Project integrations",
    summary:
      "Combine Obsidian, Jira Cloud and SharePoint Excel in one project, using a separate connection for each source.",
    sections: [
      {
        id: "steps",
        title: "Add your first source",
        html: '<ol><li>Complete <a href="#help/setup" data-action="help-article" data-id="setup">server setup</a>. Source connections work with automatic local administrator sign-in or an administrator signed in using required authentication.</li><li>Open the project, then the <strong>Project settings</strong> icon at the top right.</li><li>Choose <strong>Data sources &amp; sync → + Add source</strong>.</li><li>Choose the provider, name the source and enter its folder, Jira query or workbook details. Leave optional write capabilities off initially.</li><li>Save the source. For Jira and Excel, choose <strong>Connect</strong> and complete sign-in and consent.</li><li>Choose <strong>Preview mapping</strong>. Check the fields and values; preview creates no tasks.</li><li>Choose <strong>Sync now</strong>. Open Tasks → List, Tree, Table or Kanban to see imported records alongside local tasks. Add them to Boards using the task picker or a Project frame\'s <strong>Update plan</strong>.</li><li>Optionally choose <strong>Enable polling</strong> for reads every five minutes while the server is running.</li></ol>',
      },
      {
        id: "mixed",
        title: "Use several sources together",
        html: "<p>Repeat Add source in the same project, for example “Argus notes”, “Argus Jira” and “Argus delivery workbook”. Each has its own scope, field mapping and sync controls. Same-title records from different sources stay separate; Pencils does not merge them automatically. Use related-record links when they represent the same work.</p><p>Source-owned fields are read-only in local editors. Your local description, comments, dependencies and related-record links stay in Pencils. Optional publication is a separate, reviewed action; local annotations are not sent automatically.</p>",
      },
      {
        id: "mapping",
        title: "Map fields and values",
        html: '<p>Field mappings connect Pencils fields to source properties or Excel columns. Blank uses the same name. Imported fields are <code>title</code>, <code>type</code>, <code>status</code>, <code>priority</code>, <code>assignee</code> and <code>due</code>. Jira already supplies these normalised names; use value mappings for its labels.</p><p>For the default workflow, use this example and adjust it to your source\'s exact labels and your project\'s identifiers:</p><pre><code>{\n  "status": {\n    "To Do": "todo",\n    "In Progress": "in-progress",\n    "Done": "done"\n  },\n  "type": {\n    "Task": "task",\n    "Story": "story",\n    "Bug": "bug"\n  },\n  "priority": {\n    "Highest": "urgent",\n    "High": "high",\n    "Medium": "medium",\n    "Low": "low"\n  }\n}</code></pre><p>Unmapped choices can fall back to project defaults, so check the preview. Due dates must be <code>YYYY-MM-DD</code> text. Source hierarchies, custom-field editors, attachments and source comment threads are not recreated by these imports.</p>',
      },
      {
        id: "permissions",
        title: "What each connection can do",
        html: '<div class="help-table"><table><thead><tr><th>Source</th><th>Read</th><th>Optional publication</th></tr></thead><tbody><tr><th>Obsidian folder</th><td>Notes with stable IDs and opted-in checklist blocks.</td><td>Note title, assignee and status. Checklist title and completion only.</td></tr><tr><th>Jira Cloud</th><td>Issues matching JQL and accessible to your account.</td><td>Create, edit title, assign, transition or comment.</td></tr><tr><th>SharePoint Excel</th><td>Rows from a named .xlsx table.</td><td>Read-only. Edit the original workbook.</td></tr></tbody></table></div><p>The first source makes the project private to its source owner and workspace administrators. Imported files and backups also exist on disk, where filesystem permissions apply. Disconnect removes credentials but retains imported tasks and local notes.</p>',
      },
    ],
  },
  {
    id: "miro",
    title: "Import from Miro",
    group: "Project integrations",
    updated: "21 October 2026",
    summary:
      "Copy a Miro board into an editable Pencils canvas. This is a one-time import; later changes stay separate.",
    sections: [
      {
        id: "steps",
        title: "Import a board",
        html: '<ol><li>Open your project and choose <strong>Boards</strong> in the top navigation.</li><li>Open <strong>Board settings → Import from Miro</strong> in the toolbar above the canvas.</li><li>Choose <strong>Connect Miro</strong> and complete sign-in. If that button is unavailable, expand <strong>Use an access token</strong> and follow the token steps below.</li><li>Paste the <strong>Miro board link or ID</strong>, or choose <strong>Browse available boards</strong>. Select <strong>Load board</strong>.</li><li>Choose <strong>New board</strong> or <strong>Current canvas</strong>, then review the card and frame options. The preview shows the layout, object counts and conversion notes.</li><li>After changing any options, select <strong>Update preview</strong>. Read the conversion notes, then select <strong>Import</strong>.</li><li>Select <strong>Open imported canvas</strong> to close the report and work with the imported content.</li></ol><p>You need internet access, access to the source board in Miro, and permission to edit the Pencils project. The importer reads a board link directly; it does not accept Miro <code>.rtb</code> backup files. Pencils saves the result as a <code>.canvas</code> file in your vault.</p>',
      },
      {
        id: "token",
        title: "Connect with an access token",
        html: '<p>Use this option when Miro sign-in has not been configured on your Pencils server.</p><ol><li>In Miro, open <strong>Settings → Your apps</strong> and create or select an app. Miro requires a Developer team to create an app.</li><li>Enable the <code>boards:read</code> permission and save the app settings.</li><li>Choose <strong>Install app and get OAuth token</strong>, select a team with access to the source board, then choose <strong>Install &amp; authorize</strong>. Copy the access token.</li><li>Back in Pencils, expand <strong>Use an access token</strong>, paste it into <strong>Miro access token</strong>, and choose <strong>Connect with token</strong>.</li></ol><p>For the Miro setup screens, see the <a href="https://developers.miro.com/docs/rest-api-build-your-first-hello-world-app" target="_blank" rel="noopener noreferrer">official app and token guide ↗</a> and <a href="https://developers.miro.com/reference/scopes" target="_blank" rel="noopener noreferrer">permission scopes ↗</a>. Pencils needs only read access.</p><p>Pencils keeps the token in server memory for up to 30 minutes and clears its connection after import or <strong>Disconnect</strong>. This clears the Pencils session; it does not uninstall the app from Miro.</p>',
      },
      {
        id: "options",
        title: "Choose what to import",
        html: '<ul><li><strong>Destination:</strong> start a new canvas or add to the current canvas. Importing again into the same canvas adds new source objects and preserves earlier imports and local edits; it does not refresh them.</li><li><strong>Frames to import:</strong> keep Whole board selected, or clear it and select frames. Nested contents are included.</li><li><strong>Cards:</strong> keep them as draft cards on the board, or choose Create project tasks to add local Markdown tasks to the project.</li><li><strong>Task type and status:</strong> choose the defaults for imported cards. Priority starts at Medium; available descriptions and dates are copied.</li><li><strong>Match assignees:</strong> review the matches to people in the project’s teams. Unmatched people remain unassigned.</li></ul><p>Loading and updating a preview creates no project content. Select <strong>Import</strong> to save the reviewed result. The source Miro board stays unchanged.</p>',
      },
      {
        id: "conversion",
        title: "What carries over",
        html: '<div class="help-table"><table><thead><tr><th>Miro content</th><th>Result in Pencils</th></tr></thead><tbody><tr><th>Sticky notes, text, supported shapes and frames</th><td>Editable objects with their positions and supported styling.</td></tr><tr><th>Cards and app cards</th><td>Draft cards or project tasks. App integrations are not carried over.</td></tr><tr><th>Connectors</th><td>Visual arrows between imported objects. These do not create task dependencies.</td></tr><tr><th>Accessible images, GIFs and supported documents</th><td>Local attachments and board objects.</td></tr><tr><th>Embeds and unsupported items returned by Miro</th><td>Links or labelled placeholders at their original positions.</td></tr></tbody></table></div><p>Comments, native tables/grids and freehand strokes are not recreated. Miro may omit unsupported objects from its API entirely. Fonts, transparency, text wrapping and arrow routing can differ. Check the conversion notes before importing; use separate image or CSV exports for content the API cannot provide.</p>',
      },
      {
        id: "troubleshooting",
        title: "If the import needs attention",
        html: '<ul><li><strong>Cannot connect:</strong> use local automatic sign-in or sign in to a Pencils account with project write access. For Miro sign-in, allow its popup; if sign-in is not configured, use an access token.</li><li><strong>Board missing or access denied:</strong> check the Miro account, team and app permissions. Browse available boards lists only the first 50; paste a board link to load another accessible board.</li><li><strong>Connection or preview expired:</strong> reconnect and load the board again. Import sessions and previews last up to 30 minutes.</li><li><strong>Import disabled or destination changed:</strong> select <strong>Update preview</strong>. An empty result can mean the selected objects were already imported into that canvas.</li><li><strong>Rate limit:</strong> wait for the retry delay shown in the error, then try again.</li><li><strong>Board too large:</strong> each source read supports up to 9,500 objects and 19,000 connectors. Split a larger source into smaller Miro boards first; selecting frames happens after the source is loaded. Media is limited to 10 MB per file and 50 MB per preview. The destination canvas also needs enough remaining capacity.</li></ul>',
      },
      {
        id: "setup",
        title: "Enable Connect Miro on your server",
        html: '<p>For administrators: create a Miro OAuth app with <code>boards:read</code> and register the exact callback <code>APP_ORIGIN/api/miro-callback</code>. Set <code>MIRO_CLIENT_ID</code>, <code>MIRO_CLIENT_SECRET</code> and <code>APP_ORIGIN</code> in the private server environment, then recreate or restart the service. The callback must use HTTPS or localhost. Open Pencils at that same origin before connecting.</p><p>The access-token option works without these OAuth settings. See <a href="#help/setup" data-action="help-article" data-id="setup">server setup</a> for deployment and account settings, and <a href="https://developers.miro.com/docs/getting-started-with-oauth" target="_blank" rel="noopener noreferrer">Miro’s OAuth guide ↗</a> for app configuration.</p>',
      },
    ],
  },
  {
    id: "setup",
    title: "Server setup",
    group: "Project integrations",
    summary:
      "Prepare accounts, a reachable callback address and server-side configuration before connecting sources.",
    sections: [
      {
        id: "accounts",
        title: "Choose local sign-in or accounts",
        html: "<p>For a single-user installation on your computer or trusted local network, set <code>AUTH_MODE=local</code> and <code>LOCAL_USER_NAME=George</code> in your private <code>.env</code>, then run <code>docker compose up -d --no-build --force-recreate pencils</code>. Local and private-network connections automatically open as George with administrator access, including integrations. Settings shows the current identity. This mode trusts local network access; use required authentication behind a public reverse proxy.</p><p>For a personal installation with no login screen on any connection, including Tailscale, set <code>AUTH_MODE=single-user</code> and keep <code>LOCAL_USER_NAME=George</code>, then recreate the service. Integrations continue to work. Anyone who can reach the server gets full workspace access. Existing password accounts are kept if you later switch to required authentication.</p><p>For password-based accounts, create an administrator on the server before enabling required authentication. In a Bash terminal in the installation folder, Docker users can run:</p><pre><code>read -rs -p 'Admin password (12+ characters): ' PENCILS_ADMIN_PASSWORD\nprintf '\\n'\nprintf '%s' \"$PENCILS_ADMIN_PASSWORD\" | docker compose exec -T pencils node server/account.js admin\nunset PENCILS_ADMIN_PASSWORD</code></pre><p>Set <code>AUTH_MODE=required</code> in your private deployment environment, restart with <code>docker compose up -d</code>, and sign in as <code>admin</code>. For native Node, pipe the password to <code>node server/account.js admin</code> with the existing <code>VAULT_PATH</code>. Authentication changes affect every device using the installation.</p>",
      },
      {
        id: "address",
        title: "Choose a callback address",
        html: "<p>Set <code>APP_ORIGIN</code> to the address you actually open, including its port if needed. Cloud connections require HTTPS with a device-trusted certificate, or localhost for development. Plain LAN HTTP works for local workspace use but is rejected for cloud callbacks. Register these exact URLs, replacing the example origin:</p><pre><code>https://pencils.example.test/api/source-callback/jira\nhttps://pencils.example.test/api/source-callback/excel</code></pre><p>Open Pencils at that same origin before Connect. A localhost callback points to the device completing sign-in, so it is unsuitable for iPad sign-in to a server on another computer.</p>",
      },
      {
        id: "environment",
        title: "Configure only the providers you use",
        html: '<pre><code>AUTH_MODE=required\nAPP_ORIGIN=https://pencils.example.test\nCOOKIE_SECURE=true\n\nJIRA_CLIENT_ID=your-client-id\nJIRA_CLIENT_SECRET=your-client-secret\n\nMS_CLIENT_ID=your-application-client-id\nMS_CLIENT_SECRET=your-client-secret-value\nMS_TENANT=your-directory-tenant-id</code></pre><p>Keep actual secrets in the server\'s private environment or an untracked deployment file, never in tasks or source mappings. Docker Compose passes these variables to the app; recreate the service after changes. Native Node users must export them to the server process and restart it.</p><p>For a separate Obsidian vault, follow the <a href="#help/obsidian" data-action="help-article" data-id="obsidian">folder mount instructions</a>. Stored OAuth tokens are encrypted using <code>.pencils/source-key</code>. Preserve that key with a full installation backup; a normal vault export is not a replacement.</p>',
      },
    ],
  },
  {
    id: "obsidian",
    title: "Obsidian",
    group: "Project integrations",
    summary:
      "Choose between opening Pencils' existing Markdown vault and importing a separate Obsidian folder.",
    sections: [
      {
        id: "same-vault",
        title: "Option 1: open the same vault",
        html: '<ol><li>Find the host folder configured as <code>VAULT_PATH</code>, normally the installation\'s <code>vault</code> folder. Docker\'s <code>/data</code> is its container path.</li><li>In Obsidian\'s vault switcher choose <strong>Open folder as vault</strong> and select that host folder.</li><li>Open <code>Projects/p-…/tasks/t-….md</code> for tasks and <code>Projects/p-…/boards/b-….canvas</code> for boards.</li><li>Edit Markdown or valid YAML properties, preserving file names, IDs and project references. External changes appear when Pencils can safely refresh.</li></ol><p>No data-source connection or OAuth is needed for shared files. Do not also import these task files into the same project as an Obsidian source: that creates duplicates. Another device needs its own access to the files through your chosen file-sync arrangement; the Pencils website does not transfer a vault into Obsidian.</p><p><a href="https://help.obsidian.md/manage-vaults" target="_blank" rel="noopener noreferrer">Obsidian: manage vaults ↗</a></p>',
      },
      {
        id: "folder",
        title: "Option 2: import a separate notes folder",
        html: '<p>Complete <a href="#help/setup" data-action="help-article" data-id="setup">server setup</a>. For native Node set <code>OBSIDIAN_ROOT=/absolute/path/to/your/vault</code>. For Docker add a read-only bind mount in <code>compose.override.yaml</code>:</p><pre><code>services:\n  pencils:\n    volumes:\n      - "/absolute/path/to/your/vault:/obsidian:ro"</code></pre><p>Set <code>OBSIDIAN_CONTAINER_ROOT=/obsidian</code> in the deployment environment, then run <code>docker compose up -d</code>. Keep the existing Pencils data mount. The process needs read permission on the selected folder.</p><p>In <strong>Project settings → Data sources &amp; sync → + Add source</strong>, select <strong>Obsidian folder</strong>. Set Folder to a path relative to the root, such as <code>Projects/Argus</code>; Stable note ID property to <code>id</code>; and Obsidian vault name to the name used on your device.</p>',
      },
      {
        id: "notes",
        title: "Prepare notes and checklists",
        html: '<p>Each imported note needs a non-empty, stable ID, unique within the selected folder. Keep it unchanged when renaming or moving the note within that folder. Add these properties at the top:</p><pre><code>---\nid: argus-requirements-001\ntitle: Review the requirements\ntype: task\nstatus: todo\npriority: medium\nassignee: George\ndue: "2026-10-30"\n---\nNotes and context stay here.\n\n- [ ] Review the API contract ^review-api</code></pre><p>To import that checklist item as an additional task, enable <strong>Include opted-in checklists</strong>. The note needs its ID, and each item needs a stable <code>^block-id</code>. Ordinary checkboxes without block IDs are skipped; the note itself is also imported.</p><p>Save, choose <strong>Preview mapping</strong>, then <strong>Sync now</strong>. Map different property names in Field mappings. <a href="https://help.obsidian.md/properties" target="_blank" rel="noopener noreferrer">Obsidian: properties ↗</a>.</p>',
      },
      {
        id: "writes",
        title: "Permissions and limits",
        html: '<p>Read-only filesystem access is enough for imports. Optional Edit, Assign and Transition publish a note\'s title, assignee or status and require an intentionally writable mount. Checklist blocks support title and todo/done changes only. Note creation and comment publication are unavailable.</p><p>Writes preserve note bodies and unrelated YAML, check the imported revision and retain a previous-file backup. Sync after external edits before publishing. Limits: 10,000 Markdown files, 50 MB total, 2 MB per file. Hidden files and symlinks are skipped; Obsidian plugins are not executed.</p><p><strong>Open in source</strong> uses an Obsidian URI, so Obsidian and the named vault must be available on the device opening it. <a href="https://help.obsidian.md/uri" target="_blank" rel="noopener noreferrer">Obsidian: URI links ↗</a>.</p>',
      },
    ],
  },
  {
    id: "jira",
    title: "Jira Cloud",
    group: "Project integrations",
    summary:
      "Import a scoped set of Jira issues and optionally publish specific changes after review.",
    sections: [
      {
        id: "oauth",
        title: "Prepare the OAuth app",
        html: '<p>Complete <a href="#help/setup" data-action="help-article" data-id="setup">server setup</a>. For your own deployment, configure an OAuth 2.0 (3LO) integration in the <a href="https://developer.atlassian.com/console/myapps/" target="_blank" rel="noopener noreferrer">Atlassian developer console ↗</a>. Under Authorization enable OAuth 2.0 and register your exact <code>APP_ORIGIN/api/source-callback/jira</code> callback.</p><p>Under Permissions add Jira platform scopes <code>read:jira-work</code> and <code>read:jira-user</code>. Pencils also requests <code>offline_access</code> for refresh tokens. Set <code>JIRA_CLIENT_ID</code> and <code>JIRA_CLIENT_SECRET</code> on the server, then restart it.</p><p><a href="https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/" target="_blank" rel="noopener noreferrer">Atlassian: OAuth setup and distribution guidance ↗</a>. A distributed integration should use one developer-managed OAuth app; Atlassian\'s guidance excludes asking each customer for their own app or API token.</p>',
      },
      {
        id: "connect",
        title: "Connect the site and choose issues",
        html: "<ol><li>Add a <strong>Jira Cloud</strong> source in the project's Data sources &amp; sync.</li><li>Name it and enter a narrow JQL query, such as <code>project = ARG ORDER BY key ASC</code>. Replace ARG with the Jira project key, which can differ from the Pencils key.</li><li>If you do not know the Cloud ID, leave it blank for the first save. Choose <strong>Connect</strong> and sign into Atlassian.</li><li>Reopen Data sources &amp; sync and choose <strong>Show Jira sites</strong>. Copy the intended site's ID, then <strong>Configure</strong> the source and paste it into Jira Cloud ID. This is a site ID, not the project key.</li><li>Map Jira status, type and priority labels. Choose <strong>Preview mapping</strong>, then <strong>Sync now</strong>.</li><li>Enable polling if wanted.</li></ol><p>The OAuth connection acts with your account's permissions. Narrow JQL limits this import but does not narrow the OAuth grant itself.</p>",
      },
      {
        id: "publish",
        title: "Optional publication and permissions",
        html: '<p>Enable only the write capabilities you need in Configure. Add <code>write:jira-work</code> to the registered app, then <strong>Reconnect</strong> to consent. Open an imported task, choose <strong>Publish to source</strong>, review the action, then <strong>Publish change</strong>.</p><div class="help-table"><table><thead><tr><th>Capability</th><th>Required input and Jira access</th></tr></thead><tbody><tr><th>Edit</th><td>Title/summary; Edit Issues.</td></tr><tr><th>Create</th><td>Project key, issue type ID and title; Create Issues.</td></tr><tr><th>Assign</th><td>Jira account ID, not display name; Assign Issues and an assignable user.</td></tr><tr><th>Transition</th><td>Available transition ID, not destination status ID; Transition Issues and workflow conditions.</td></tr><tr><th>Comment</th><td>Comment text; Add Comments.</td></tr></tbody></table></div><p>Ask your Jira administrator for account, issue-type or transition IDs if needed. Project permissions, issue security, validators and required fields still apply. Basic creation cannot supply additional required custom fields. Local Pencils comments do not publish automatically. <a href="https://developer.atlassian.com/cloud/jira/platform/scopes-for-oauth-2-3LO-and-forge-apps/" target="_blank" rel="noopener noreferrer">Atlassian: Jira scopes ↗</a>.</p>',
      },
      {
        id: "limits",
        title: "Current limits",
        html: "<p>This adapter supports Jira Cloud, not Data Center. Up to 10,000 matching issues and a normalised description snapshot are imported. Jira boards, sprints, custom-field editors, attachment libraries and comment history are not recreated. Missing query results are labelled not returned, not confirmed deleted. Review the source after an uncertain publication before retrying.</p>",
      },
    ],
  },
  {
    id: "excel",
    title: "SharePoint Excel",
    group: "Project integrations",
    summary:
      "Read rows from a named SharePoint .xlsx table. Changes to the workbook are made in Excel.",
    sections: [
      {
        id: "workbook",
        title: "Prepare the workbook",
        html: "<ol><li>Use an <code>.xlsx</code> file in a SharePoint document library your work account can access.</li><li>Format the task range as an Excel <strong>Table</strong> with headers. Name it, for example <code>ProjectTasks</code>. A worksheet name or loose cell range is not enough.</li><li>Add a unique, stable text column, such as <code>TaskID</code>, with literal values like <code>ARG-EXT-001</code>. Do not use changing row numbers or formulas for IDs.</li><li>Add a title and optional task columns. Store due dates as <code>YYYY-MM-DD</code> text; numeric Excel date serials are not converted.</li><li>Save the workbook to SharePoint.</li></ol><p>Example columns: <code>TaskID | Title | Status | Priority | Assignee | Due</code>. Map the exact names, including case, to Pencils fields.</p>",
      },
      {
        id: "microsoft",
        title: "Register the Microsoft connection",
        html: '<p>Complete <a href="#help/setup" data-action="help-article" data-id="setup">server setup</a>. In Microsoft Entra ID → App registrations, register an app for your organisation. Add a <strong>Web</strong> redirect URI: <code>APP_ORIGIN/api/source-callback/excel</code>. <a href="https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app" target="_blank" rel="noopener noreferrer">Register an application ↗</a> · <a href="https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri" target="_blank" rel="noopener noreferrer">Configure the redirect URI ↗</a>.</p><p>Add delegated Microsoft Graph <code>Files.Read.All</code> and <code>offline_access</code>. Create a client secret and copy its <strong>value</strong>, not its ID. Set <code>MS_CLIENT_ID</code>, <code>MS_CLIENT_SECRET</code> and <code>MS_TENANT</code> (your directory tenant ID), then restart Pencils. <a href="https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-credentials" target="_blank" rel="noopener noreferrer">Manage app credentials ↗</a>.</p><p>Your account needs workbook access; tenant policy may require administrator consent. Files.Read.All is broader than one workbook. Selecting a workbook limits the import, not the OAuth grant. Selected-resource permission variants are not implemented. <a href="https://learn.microsoft.com/en-us/graph/permissions-reference#filesreadall" target="_blank" rel="noopener noreferrer">Microsoft Graph permissions ↗</a>.</p>',
      },
      {
        id: "identifiers",
        title: "Find drive and workbook IDs",
        html: '<p>Pencils currently needs IDs entered manually. Ask your SharePoint administrator for the document library\'s Graph drive ID and workbook item ID, or use Graph Explorer with your work account. These are read-only lookup requests:</p><pre><code>GET https://graph.microsoft.com/v1.0/sites/contoso.sharepoint.com:/sites/Argus\nGET https://graph.microsoft.com/v1.0/sites/{site-id}/drives\nGET https://graph.microsoft.com/v1.0/drives/{drive-id}/root:/Plans/Project.xlsx</code></pre><p>Copy the site ID from the first result; select the library and copy its drive ID from the second; copy the workbook ID from the third. File paths are relative to the library root and special characters need URL encoding. Do not paste sharing URLs into the ID fields.</p><p>Graph Explorer has separate consent. The site-by-path lookup requires <code>Sites.Read.All</code> there; Pencils does not request it. Ask an administrator for the IDs if that lookup is blocked. <a href="https://learn.microsoft.com/en-us/graph/api/site-getbypath?view=graph-rest-1.0" target="_blank" rel="noopener noreferrer">Find a site ↗</a> · <a href="https://learn.microsoft.com/en-us/graph/api/drive-list?view=graph-rest-1.0" target="_blank" rel="noopener noreferrer">List libraries ↗</a> · <a href="https://learn.microsoft.com/en-us/graph/api/driveitem-get?view=graph-rest-1.0" target="_blank" rel="noopener noreferrer">Find a workbook ↗</a>.</p>',
      },
      {
        id: "sync",
        title: "Connect and sync",
        html: '<ol><li>Choose <strong>Project settings → Data sources &amp; sync → + Add source → SharePoint Excel</strong>.</li><li>Enter the source name, SharePoint drive ID, Workbook item ID, Named table (for example <code>ProjectTasks</code>) and Stable ID column (for example <code>TaskID</code>).</li><li>In Field mappings, map title to <code>Title</code>, status to <code>Status</code>, and so on. Add value mappings where source labels differ from project identifiers.</li><li>Save, then <strong>Connect</strong> using the account with workbook access.</li><li>Choose <strong>Preview mapping</strong>, then <strong>Sync now</strong>. Enable polling if wanted.</li></ol><p>Pencils downloads the workbook and reads the named table locally, without an Excel editing session. <a href="https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0" target="_blank" rel="noopener noreferrer">Microsoft Graph: download file content ↗</a>.</p>',
      },
      {
        id: "limits",
        title: "Read-only permissions and limits",
        html: "<p><strong>Excel is read-only in Pencils.</strong> Edit the source workbook, save, then sync. No Excel or SharePoint write permission is requested. Formulas are not evaluated; non-ID formulas can expose only their cached saved values. Formula IDs are rejected.</p><p>Limits: 20 MB downloaded, 100 MB expanded, 5,000 ZIP entries and 10,000 table rows. Missing/duplicate IDs, a renamed table or invalid dates prevent import. Formatting, charts and macros are not reproduced in Tasks.</p>",
      },
    ],
  },
  {
    id: "sync",
    title: "Sync & troubleshooting",
    group: "Reference",
    summary:
      "Understand sync states, resolve conflicts and keep local annotations separate from source records.",
    sections: [
      {
        id: "controls",
        title: "Daily sync controls",
        html: "<p>Open <strong>Project settings → Data sources &amp; sync</strong> for record counts, last success, errors, conflicts and publish logs.</p><ul><li><strong>Preview mapping:</strong> read without creating tasks.</li><li><strong>Sync now:</strong> import current values.</li><li><strong>Enable polling / Pause:</strong> start or stop five-minute reads while the server and source are reachable.</li><li><strong>Disconnect:</strong> remove credentials and stop reads; local copies remain.</li><li><strong>Keep local / Use source:</strong> resolve a field conflict. Keeping local does not publish.</li><li><strong>Export sync diagnostics:</strong> download troubleshooting details without OAuth credentials.</li></ul>",
      },
      {
        id: "problems",
        title: "Common problems",
        html: '<div class="help-table"><table><thead><tr><th>Problem</th><th>What to check</th></tr></thead><tbody><tr><th>Setup blocked</th><td>Local automatic sign-in or a signed-in administrator in required mode, environment variables and a restarted server.</td></tr><tr><th>Redirect mismatch / expired sign-in</th><td>APP_ORIGIN must match the registered callback and browser origin. Start Connect again; OAuth state is short-lived and tied to your session.</td></tr><tr><th>401 or 403</th><td>Reconnect; check consent and site/workbook access. Microsoft tenant policy can block consent.</td></tr><tr><th>No Obsidian records</th><td>Folder mount, relative path, read permission and stable IDs. Checklists require block IDs.</td></tr><tr><th>No Jira records</th><td>Cloud ID, JQL and browse permissions. Run the same query in Jira.</td></tr><tr><th>Excel preview fails</th><td>Drive/item IDs, named table, unique literal row IDs and ISO date text.</td></tr><tr><th>Unexpected status/type/priority</th><td>Value mapping uses the source\'s exact label and a configured project identifier.</td></tr><tr><th>Not returned</th><td>A query or access change may have hidden the record. This does not confirm deletion.</td></tr><tr><th>Rate limit</th><td>Wait for the retry delay; narrow the import scope if needed.</td></tr><tr><th>Publish conflict / uncertain result</th><td>Inspect the source, sync and review again. Do not blindly repeat creates or comments.</td></tr></tbody></table></div>',
      },
      {
        id: "storage",
        title: "Access and recovery",
        html: "<p>Source projects stay private to their owner and workspace administrators, including after disconnect. This personal integration model does not mirror each provider's record-level sharing. Disk, backup and device access are separate. Revoked source access stops future sync but does not erase imported files.</p><p><strong>Settings → Recovery &amp; backups</strong> contains local drafts, history, trash and vault backups. Keep an installation backup including hidden directories and the encryption key. Local recovery does not undo a remote Jira publication; inspect publish logs before retrying.</p>",
      },
    ],
  },
  {
    id: "shortcuts",
    title: "Shortcuts & local access",
    group: "Reference",
    summary:
      "Keyboard controls, access from your iPad and the structure of your workspace.",
    sections: [
      {
        id: "keyboard",
        title: "Keyboard shortcuts",
        html: '<div class="help-table"><table><thead><tr><th>Action</th><th>Shortcut</th></tr></thead><tbody><tr><td>New card (every view except Boards)</td><td><kbd>N</kbd></td></tr><tr><td>Sticky note tool (on a board, like Miro)</td><td><kbd>N</kbd></td></tr><tr><td>Find a task</td><td><kbd>/</kbd></td></tr><tr><td>Search all projects</td><td><kbd>Ctrl / ⌘ + K</kbd></td></tr><tr><td>Save an open editor</td><td><kbd>Ctrl / ⌘ + Enter</kbd></td></tr><tr><td>Pan the board</td><td><kbd>Space + drag</kbd></td></tr><tr><td>Zoom the board</td><td><kbd>Ctrl / ⌘ + wheel</kbd></td></tr><tr><td>Undo a board change</td><td><kbd>Ctrl / ⌘ + Z</kbd></td></tr><tr><td>Edit selected arrow text</td><td><kbd>Enter</kbd></td></tr></tbody></table></div><p>Text inputs keep normal typing behaviour. Board-specific tools and shortcuts also appear in the Boards menus.</p>',
      },
      {
        id: "network",
        title: "Connect from your iPad",
        html: "<p>Keep the server running. On the same local network, open <code>http://SERVER-IP:3000</code> in Safari, replacing SERVER-IP with the server computer's LAN address. Allow the configured port through its firewall. Use your configured HTTPS address when accounts or cloud connections require it.</p><p>Boards combines task cards, notes, images and drawing. Apple Pencil draws; fingers pan, pinch, select and manipulate objects. Configure gestures in drawing controls. Offline drawing requires trusted HTTPS and preparation while online. A browser checkpoint is not the same as a server save.</p>",
      },
      {
        id: "workspace",
        title: "Organisations, files and recovery",
        html: '<p>Switch organisations in the sidebar. Each has projects; use project settings to move a project. Organisations live in <code>Organisations/</code>, tasks as Markdown under <code>Projects/</code>, and boards as native <code>.canvas</code> files. See <a href="#help/obsidian" data-action="help-article" data-id="obsidian">Obsidian</a> for using the files directly.</p><p>Shared mode lets trusted devices reaching the server edit the workspace. Required accounts provide administrator, organisation editor and viewer access. <strong>Settings → Recovery &amp; backups</strong> holds browser drafts, history, trash and vault backups.</p>',
      },
    ],
  },
];

export function helpArticle(id) {
  return helpArticles.find((article) => article.id === id) || helpArticles[0];
}
