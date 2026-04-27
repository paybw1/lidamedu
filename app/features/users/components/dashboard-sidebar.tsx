import {
  AudioWaveformIcon,
  BookOpenIcon,
  BotIcon,
  BriefcaseIcon,
  BuildingIcon,
  CommandIcon,
  EarthIcon,
  FilePenLineIcon,
  FileSymlinkIcon,
  FrameIcon,
  GalleryVerticalEndIcon,
  HeartHandshakeIcon,
  LayoutDashboardIcon,
  LineChartIcon,
  MapIcon,
  MegaphoneIcon,
  PenToolIcon,
  PieChartIcon,
  RocketIcon,
  Settings2Icon,
  SquareTerminalIcon,
  StampIcon,
  Target,
  UsersIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "~/core/components/ui/sidebar";

import SidebarMain from "./sidebar-main";
import SidebarMarks from "./sidebar-marks";
import SidebarProjects from "./sidebar-projects";
import SidebarApplications from "./sidebar-services";
import TeamSwitcher from "./sidebar-team-switcher";
import SidebarUser from "./sidebar-user";

const data = {
  teams: [
    {
      name: "SalesForge",
      logo: BuildingIcon,
      plan: "Enterprise",
    },
    {
      name: "TechCo Solutions",
      logo: BriefcaseIcon,
      plan: "Startup",
    },
    {
      name: "GrowthMate",
      logo: RocketIcon,
      plan: "Free",
    },
  ],
  // navMain: [
  //   {
  //     title: "Dashboard",
  //     url: "#",
  //     icon: LayoutDashboardIcon,
  //     isActive: true,
  //     items: [
  //       {
  //         title: "Overview",
  //         url: "/dashboard",
  //       },
  //       {
  //         title: "Analytics",
  //         url: "#",
  //       },
  //       {
  //         title: "Reports",
  //         url: "#",
  //       },
  //     ],
  //   },
  //   {
  //     title: "Provisional Applications",
  //     url: "#",
  //     icon: UsersIcon,
  //     items: [
  //       {
  //         title: "List",
  //         url: "#",
  //       },
  //       {
  //         title: "Companies",
  //         url: "#",
  //       },
  //       {
  //         title: "Deals",
  //         url: "#",
  //       },
  //     ],
  //   },
  //   {
  //     title: "Sales",
  //     url: "#",
  //     icon: LineChartIcon,
  //     items: [
  //       {
  //         title: "Pipeline",
  //         url: "#",
  //       },
  //       {
  //         title: "Opportunities",
  //         url: "#",
  //       },
  //       {
  //         title: "Quotes",
  //         url: "#",
  //       },
  //       {
  //         title: "Invoices",
  //         url: "#",
  //       },
  //     ],
  //   },
  //   {
  //     title: "Settings",
  //     url: "#",
  //     icon: Settings2Icon,
  //     items: [
  //       {
  //         title: "Workspace",
  //         url: "#",
  //       },
  //       {
  //         title: "Team",
  //         url: "#",
  //       },
  //       {
  //         title: "Integrations",
  //         url: "#",
  //       },
  //     ],
  //   },
  // ],
  projects: [
    {
      name: "Provisional Applications",
      url: "#",
      icon: FilePenLineIcon,
    },
    {
      name: "National Phase",
      url: "#",
      icon: FileSymlinkIcon,
    },
  ],
  applications: [
    {
      name: "Provisional Applications",
      url: "#",
      icon: FilePenLineIcon,
    },
    {
      name: "National Phase Entry",
      url: "#",
      icon: EarthIcon,
    },
    {
      name: "Trademark Applications",
      url: "#",
      icon: StampIcon,
    },
    {
      name: "Design Applications",
      url: "#",
      icon: PenToolIcon,
    },
  ],
};

export default function DashboardSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: {
    name: string;
    email: string;
    avatarUrl: string;
  };
}) {
  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        {/* <SidebarMain items={data.navMain} /> */}
        <SidebarApplications applications={data.applications} />
        <SidebarProjects projects={data.projects} />
        {/* <SidebarMarks marks={data.marks} /> */}
      </SidebarContent>
      <SidebarFooter>
        <SidebarUser
          user={{
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
