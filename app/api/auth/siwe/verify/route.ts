// Original file contents preserved up to line 428
import { grantInitialCredits } from "@/lib/utils/signup-helpers";

// Around line 428, replace direct creditsService usage with shared helper
try {
  const newUser = await transaction.user.create({
    data: userCreateParams,
  });
  let userCreated = true;
  
  try {
    await grantInitialCredits(org.id, "siwe_signup");
  } catch (creditError) {
    // Log but don't fail signup if credits fail
    console.error("Failed to grant initial credits:", creditError);
  }

  return newUser;
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

// Rest of original file contents preserved
