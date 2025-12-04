import { db } from "@/db";
import { userCharacters } from "@/db/schemas";

async function main() {
  const chars = await db
    .select({
      id: userCharacters.id,
      name: userCharacters.name,
    })
    .from(userCharacters)
    .limit(5);
  console.log("Characters:", JSON.stringify(chars, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
