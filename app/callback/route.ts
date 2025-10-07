import { handleAuth } from "@workos-inc/authkit-nextjs";
import { syncWorkOSUser } from "@/lib/workos-sync";

export const GET = handleAuth({
  returnPathname: "/dashboard",
  async onSuccess(data) {
    try {
      await syncWorkOSUser({
        id: data.user.id,
        email: data.user.email,
        firstName: data.user.firstName,
        lastName: data.user.lastName,
      });
    } catch (error) {
      console.error("[CALLBACK] Failed to sync user:", error);
    }
  },
});
