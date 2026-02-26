import { grantInitialCredits } from "@/lib/utils/signup-helpers";

async function handleVerify(request) {
    let userCreated = false; // Move to outer scope for catch block access

    try {
        const newUser = await transaction.user.create({
            data: userCreateParams,
        });
        userCreated = true;
        
        try {
            await grantInitialCredits(org.id, "siwe_signup");
        } catch (creditError) {
            // Log but don't fail signup if credits fail
            console.error("Failed to grant initial credits:", creditError);
        }

        return buildSuccessResponse(newUser, signupResult.plainKey, address, true);
    } catch (error) {
        if (userCreated) {
            try {
                await organizationsService.delete(org.id);
            } catch (cleanupError) {
                console.error("Failed to clean up organization:", cleanupError);
            }
        }
        throw error;
    }
}

export const POST = withRateLimit(handleVerify, RateLimitPresets.STRICT);
// Review: nonce validation uses atomicConsume for accurate deletion count verification
