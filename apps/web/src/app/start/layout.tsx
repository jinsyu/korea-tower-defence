import { StartFlowProvider } from "@/components/start-flow";

export default function StartLayout({ children }: LayoutProps<"/start">) {
  return <StartFlowProvider>{children}</StartFlowProvider>;
}
