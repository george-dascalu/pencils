import { Store } from "./store.js";
import { Auth } from "./auth.js";
const store = new Store(process.env.VAULT_PATH || "vault");
await store.init();
const username = process.argv[2];
let password = "";
for await (const chunk of process.stdin) password += chunk;
try {
  await new Auth(store).save({
    username,
    password: password.replace(/\r?\n$/, ""),
    admin: true,
    organisations: {},
  });
  console.log(
    `Administrator ${username} is ready. Set AUTH_MODE=required and restart.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
