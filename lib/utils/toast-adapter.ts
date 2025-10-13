/**
 * Toast Adapter
 *
 * Provides a unified toast interface that wraps sonner
 * for compatibility with API Explorer components
 */

import { toast as sonnerToast } from "sonner";

export const toast = (options: {
  message: string;
  mode: "success" | "error" | "info";
}) => {
  switch (options.mode) {
    case "success":
      return sonnerToast.success(options.message);
    case "error":
      return sonnerToast.error(options.message);
    case "info":
      return sonnerToast.info(options.message);
  }
};
