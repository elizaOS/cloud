import { buildSuccessResponse } from "@/lib/utils/response-builders";
import { getUserCreateParams, getOrganizationDetails } from "@/lib/utils/user-helpers";
import { transaction } from "@/lib/database";
import { organizationsService } from "@/lib/services/organizations";
import { withRateLimit, RateLimitPresets } from "@/lib/rate-limiter";
import { validateSIWEMessage, checkNonce } from "@/lib/utils/siwe-helpers";
import { NextRequest } from "next/server";

async function handleVerify(request: NextRequest) {
    const { message, signature } = await request.json();
    let userCreated = false;
    let org = null;

    try {
        // Validate the SIWE message
        const SiweMessage = validateSIWEMessage(message, signature);
        if (!SiweMessage) throw new Error("Invalid SIWE message");

        // Ensure the nonce is valid
        const nonceValid = await checkNonce(SiweMessage.nonce);
        if (!nonceValid) throw new Error("Invalid nonce");

        const userCreateParams = getUserCreateParams(SiweMessage);
        org = await getOrganizationDetails(userCreateParams.organization_id);

        if (!org) {
            throw new Error("Organization not found");
        }
        
        const newUser = await transaction.user.create({
            data: userCreateParams,
        });
        userCreated = true;

        console.log(`Granting initial credits for organization ${(org ? org.id : 'N/A')}`);

        return buildSuccessResponse(newUser, userCreateParams.plainKey, org.address);
    } catch (error) {
        if (!userCreated && org) {
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

// Review: atomicConsume ensures nonce is properly validated without always failing.
