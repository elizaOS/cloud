import { usersService } from "@/lib/services/users";
import { organizationsService } from "@/lib/services/organizations";
import { validateNonce } from "@/lib/utils/siwe-helpers";
import { User, Organization } from "@/lib/types"; // Import User and Organization types

export async function verifyUserAndCreateOrg(
  address: string,
  nonce: string
): Promise<{ user: User; organization: Organization }> {
    const validNonce = await validateNonce(address, nonce); // Assume this function verifies the nonce
    if (!validNonce) {
        throw new Error('INVALID_NONCE');
    }

    const existingUser = await usersService.getByWalletAddressWithOrganization(address);
    if (existingUser) {
        return { user: existingUser, organization: existingUser.organization };
    }

    const newUser = await usersService.create({ address }); // Assume user creation returns a user object
    const organization = await organizationsService.create({ userId: newUser.id }); // Create organization for new user

    return { user: newUser, organization };
}
