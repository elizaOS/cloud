async function verifyUserAndCreateOrg(address, nonce) {
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
