import { Redirect } from "expo-router";
import { useAuth } from "@/context/auth-context";

const Index = () => {
  const { isAuthenticated, isOnboarded } = useAuth();
  return <Redirect href={isAuthenticated ? (isOnboarded ? "/events" : "/onboarding") : "/login"} />;
};

export default Index;
