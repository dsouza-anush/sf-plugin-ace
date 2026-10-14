import { createHash, createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SfError } from '@salesforce/core';

const exec = promisify(execFile);
export const setupScopes = ['Api', 'RefreshToken', 'CDPQuery', 'CDPIngest'];
export type SetupOptions = {
  orgId: string;
  admin: string;
  instanceUrl: string;
  username: string;
  appName: string;
  contactEmail: string;
  alias: string;
  keyDirectory: string;
  agentId: string;
};
export type MetadataRecord = Record<string, unknown>;
export type SetupPlan = ReturnType<typeof setupPlan>;

export function setupPlan(options: SetupOptions) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,29}$/.test(options.appName))
    throw new SfError(
      'Use an app name starting with a letter, up to 30 letters, digits or underscores.',
      'InvalidSetupName',
    );
  for (const value of [options.username, options.contactEmail, options.alias, options.agentId])
    if (
      !value ||
      Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    )
      throw new SfError('Setup arguments must be nonempty and contain no control characters.', 'InvalidSetupInput');
  const url = new URL(options.instanceUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new SfError('Setup requires an HTTPS Salesforce org origin.', 'InvalidSetupOrigin');
  const plan = {
    ...options,
    keyDirectory: resolve(options.keyDirectory),
    permissionSet: `${options.appName}_User`,
    scopes: setupScopes,
    actions: [
      'Inspect existing metadata and user',
      'Create or reuse local certificate and private key',
      'Deploy a new JWT ECA and preauthorization permission set, or verify an existing app',
      'Assign the permission set to the named user if missing',
      'Save Salesforce CLI JWT login; existing aliases for this username are kept and use it',
      'Exchange the org token and read ACE conversations for this employee',
    ],
  };
  return { ...plan, fingerprint: createHash('sha256').update(JSON.stringify(plan)).digest('hex') };
}

export async function sfJson(args: string[], cwd?: string): Promise<Record<string, unknown>> {
  let output: string;
  try {
    output = (
      await exec('sf', [...args, '--json'], {
        cwd,
        timeout: 180_000,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, SF_AUTOUPDATE_DISABLE: 'true' },
      })
    ).stdout;
  } catch (error) {
    // CLI errors can contain auth responses. Never include stdout/stderr in the exception.
    const raw = error as { stdout?: string };
    output = raw.stdout ?? '';
  }
  let envelope: { status?: number; result?: Record<string, unknown>; name?: string };
  try {
    envelope = JSON.parse(output) as typeof envelope;
  } catch {
    throw new SfError(
      `Salesforce CLI ${args.slice(0, 3).join(' ')} did not return a result. Inspect org state before retrying.`,
      'SetupOutcomeUnknown',
    );
  }
  if (envelope.status !== 0 || !envelope.result)
    throw new SfError(
      `Salesforce CLI ${args.slice(0, 3).join(' ')} failed${envelope.name && /^\w+$/.test(envelope.name) ? ` (${envelope.name})` : ''}${typeof envelope.result?.id === 'string' && /^[A-Za-z0-9]{15,18}$/.test(envelope.result.id) ? ` (deployment ${envelope.result.id})` : ''}. No automatic retry was made. Inspect the deployment, permissions or login before retrying.`,
      'SetupCommandFailed',
    );
  return envelope.result;
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}

export async function keyPair(
  directory: string,
  allowCreate: boolean,
): Promise<{ keyFile: string; certificate: string }> {
  const keyFile = join(directory, 'server.key');
  const certFile = join(directory, 'server.crt');
  if (await exists(directory)) {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== 'win32' && info.mode & 0o077))
      throw new SfError(
        'The key directory must be a private directory (mode 0700), not a symlink.',
        'UnsafeSetupDirectory',
      );
  } else {
    if (!allowCreate)
      throw new SfError(
        'Existing app requires its original certificate and private key in --key-dir as server.crt and server.key.',
        'SetupKeyMissing',
      );
    await mkdir(directory, { recursive: true, mode: 0o700 });
  }
  const keyExists = await exists(keyFile),
    certExists = await exists(certFile);
  if (keyExists !== certExists)
    throw new SfError(
      'Incomplete key pair. Restore the matching server.key and server.crt; setup will not overwrite either file.',
      'SetupKeyIncomplete',
    );
  if (!keyExists) {
    if (!allowCreate)
      throw new SfError(
        'Existing app requires its original key pair. Setup will not rotate credentials.',
        'SetupKeyMissing',
      );
    // Exclusive reservation prevents overwriting credentials from another setup process.
    await writeFile(keyFile, '', { flag: 'wx', mode: 0o600 });
    await writeFile(certFile, '', { flag: 'wx', mode: 0o600 });
    try {
      await exec(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-sha256',
          '-nodes',
          '-keyout',
          keyFile,
          '-out',
          certFile,
          '-days',
          '365',
          '-subj',
          '/CN=ACE CLI JWT',
        ],
        { timeout: 30_000 },
      );
    } catch {
      throw new SfError(
        'Could not generate the certificate with OpenSSL. Inspect the reserved key files before retrying.',
        'SetupKeyGenerationFailed',
      );
    }
  }
  for (const file of [keyFile, certFile]) {
    const info = await lstat(file);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      (file === keyFile && process.platform !== 'win32' && info.mode & 0o077)
    )
      throw new SfError('The private key must have mode 0600 and key files must not be symlinks.', 'UnsafeSetupKey');
  }
  const certificate = await readFile(certFile, 'utf8');
  try {
    const cert = new X509Certificate(certificate);
    const publicKey = createPublicKey(createPrivateKey(await readFile(keyFile)));
    if (
      publicKey.asymmetricKeyType !== 'rsa' ||
      (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 ||
      !cert.publicKey.equals(publicKey) ||
      Date.parse(cert.validTo) <= Date.now() ||
      Date.parse(cert.validFrom) > Date.now()
    )
      throw new Error();
  } catch {
    throw new SfError('The certificate must be valid and match the RSA private key.', 'SetupKeyMismatch');
  }
  return { keyFile, certificate };
}

const xml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
const document = (type: string, fields: Record<string, string>) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<${type} xmlns="http://soap.sforce.com/2006/04/metadata">\n${Object.entries(
    fields,
  )
    .map(([key, value]) => `  <${key}>${xml(value)}</${key}>`)
    .join('\n')}\n</${type}>\n`;

export function setupMetadata(plan: SetupPlan, certificate: string): Record<string, string> {
  const app = plan.appName;
  return {
    [`externalClientApps/${app}.eca-meta.xml`]: document('ExternalClientApplication', {
      contactEmail: plan.contactEmail,
      description: 'Headless JWT login for the ACE Salesforce CLI plugin (Data 360 runtime).',
      distributionState: 'Local',
      isProtected: 'false',
      label: app,
    }),
    [`extlClntAppOauthSettings/${app}.ecaOauth-meta.xml`]: document('ExtlClntAppOauthSettings', {
      commaSeparatedOauthScopes: setupScopes.join(', '),
      externalClientApplication: app,
      isFirstPartyAppEnabled: 'false',
      label: `${app} OAuth Settings`,
    }),
    [`extlClntAppGlobalOauthSets/${app}.ecaGlblOauth-meta.xml`]: document('ExtlClntAppGlobalOauthSettings', {
      callbackUrl: 'http://localhost:1717/OauthRedirect',
      certificate,
      externalClientApplication: app,
      isClientCredentialsFlowEnabled: 'false',
      isCodeCredFlowEnabled: 'false',
      isConsumerSecretOptional: 'true',
      isDeviceFlowEnabled: 'false',
      isIntrospectAllTokens: 'false',
      isNamedUserJwtEnabled: 'false',
      isPkceRequired: 'true',
      isRefreshTokenRotationEnabled: 'true',
      isSecretRequiredForRefreshToken: 'false',
      isSecretRequiredForTokenExchange: 'false',
      isTokenExchangeEnabled: 'false',
      label: `${app} Global OAuth Settings`,
      shouldRotateConsumerKey: 'false',
      shouldRotateConsumerSecret: 'false',
    }),
    [`extlClntAppPolicies/${app}_defaultPolicy.ecaPlcy-meta.xml`]: document('ExtlClntAppConfigurablePolicies', {
      externalClientApplication: app,
      isEnabled: 'true',
      isOauthPluginEnabled: 'true',
      label: `${app}_defaultPolicy`,
      startPage: 'None',
    }),
    [`extlClntAppOauthPolicies/${app}_defaultPolicy.ecaOauthPlcy-meta.xml`]: document(
      'ExtlClntAppOauthConfigurablePolicies',
      {
        commaSeparatedPermissionSet: plan.permissionSet,
        externalClientApplication: app,
        ipRelaxationPolicyType: 'Enforce',
        isClientCredentialsFlowEnabled: 'false',
        isGuestCodeCredFlowEnabled: 'false',
        isTokenExchangeFlowEnabled: 'false',
        label: `${app}_defaultPolicy`,
        permittedUsersPolicyType: 'AdminApprovedPreAuthorized',
        refreshTokenPolicyType: 'SpecificLifetime',
        refreshTokenValidityPeriod: '30',
        refreshTokenValidityUnit: 'Days',
        requiredSessionLevel: 'STANDARD',
      },
    ),
    [`permissionsets/${plan.permissionSet}.permissionset-meta.xml`]: document('PermissionSet', {
      description: 'Pre-authorizes the ACE CLI external client app for headless JWT login.',
      hasActivationRequired: 'false',
      label: `${app} User`,
    }),
  };
}

export function verifySetupMetadata(
  plan: SetupPlan,
  certificate: string,
  records: Record<string, MetadataRecord>,
): string {
  const global = records.global ?? {},
    oauth = records.oauth ?? {},
    policy = records.policy ?? {},
    appPolicy = records.appPolicy ?? {};
  const mismatch = () =>
    new SfError(
      'Existing ECA settings do not match this setup. No settings or credentials were overwritten. Use a different app name or have an administrator reconcile the configuration.',
      'SetupConfigurationMismatch',
    );
  const actualScopes = String(oauth.commaSeparatedOauthScopes ?? '')
    .split(',')
    .map((s) => s.trim())
    .sort();
  if (
    JSON.stringify(actualScopes) !== JSON.stringify([...setupScopes].sort()) ||
    policy.permittedUsersPolicyType !== 'AdminApprovedPreAuthorized' ||
    policy.commaSeparatedPermissionSet !== plan.permissionSet ||
    policy.commaSeparatedProfile ||
    policy.ipRelaxationPolicyType !== 'Enforce' ||
    String(appPolicy.isEnabled) !== 'true' ||
    String(appPolicy.isOauthPluginEnabled) !== 'true' ||
    [
      'isClientCredentialsFlowEnabled',
      'isCodeCredFlowEnabled',
      'isDeviceFlowEnabled',
      'isTokenExchangeEnabled',
      'isNamedUserJwtEnabled',
    ].some((k) => String(global[k]) !== 'false')
  )
    throw mismatch();
  for (const record of [global, oauth, policy, appPolicy])
    if (record.externalClientApplication !== plan.appName) throw mismatch();
  try {
    const stored = String(global.certificate ?? '');
    const remote = new X509Certificate(
      stored.includes('BEGIN CERTIFICATE')
        ? stored
        : `-----BEGIN CERTIFICATE-----\n${stored}\n-----END CERTIFICATE-----`,
    );
    if (remote.fingerprint256 !== new X509Certificate(certificate).fingerprint256) throw mismatch();
  } catch {
    throw mismatch();
  }
  if (typeof global.consumerKey !== 'string' || !/^[A-Za-z0-9._~-]+$/.test(global.consumerKey)) throw mismatch();
  return global.consumerKey;
}

export const shellQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;
