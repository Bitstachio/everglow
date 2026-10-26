import { Redirect } from "expo-router";
import { useAuth } from "@/context/auth-context";

const Index = () => {
  const { isAuthenticated, isOnboarded, isSuspended } = useAuth();
  if (!isAuthenticated) return <Redirect href="/login" />;
  if (isSuspended) return <Redirect href="/account-suspended" />;
  return <Redirect href={isOnboarded ? "/events" : "/onboarding"} />;
};

export default Index;
