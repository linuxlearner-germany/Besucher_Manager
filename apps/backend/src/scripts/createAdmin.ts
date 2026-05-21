import { createOrUpdateAdmin } from "../lib/users";

function readArg(name: string): string | undefined {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

async function main() {
  const username = readArg("username") || process.env.INITIAL_ADMIN_USER;
  const password = readArg("password") || process.env.INITIAL_ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error("Missing admin credentials. Use --username/--password or INITIAL_ADMIN_USER/INITIAL_ADMIN_PASSWORD.");
  }

  const result = await createOrUpdateAdmin({ username, password });
  console.log(result.created ? `Created admin user ${username}.` : `Updated admin user ${username}.`);
}

main().catch((error) => {
  console.error("Create-admin failed.", error);
  process.exit(1);
});
