import type { LoaderFunctionArgs } from "@remix-run/node";
import { destroyAdminSession } from "../services/admin-session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return destroyAdminSession(request);
};

export default function Logout() {
  return null;
}
