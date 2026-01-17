/**
 * Test Data Builders
 *
 * Fluent API builders for creating test data.
 * Follow the Test Data Builder pattern (Nat Pryce).
 *
 * @example
 * import { OrgBuilder, UserBuilder, CharacterBuilder } from "@/tests/builders"
 *
 * const org = await new OrgBuilder().withCredits(100).build(tx)
 * const user = await new UserBuilder().withOrganization(org.id).asOwner().build(tx)
 * const character = await new CharacterBuilder()
 *   .withOrganization(org.id)
 *   .withUser(user.id)
 *   .build(tx)
 */

export { OrgBuilder } from "./organization.builder";
export { UserBuilder } from "./user.builder";
export { CharacterBuilder } from "./character.builder";
