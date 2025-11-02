"use client"

import { useState } from "react"
import { Database, Shield, Mic, Workflow, Code, BarChart3 } from "lucide-react"
import { KnowledgeBasesSection } from "@/components/knowledge-base/KnowledgeBasesSection"
import { ComingSoonSection } from "@/components/coming-soon-section"
import { ApisSection } from "@/components/apis-section"
import { GuardrailsSection } from "@/components/guardrails-section"
import { AnalyticsSection } from "@/components/AnalyticsSection"

type TabId =
  | "knowledge-bases"
  | "guardrails"
  | "voice-config"
  | "data-pipelines"
  | "apis"
  | "analytics"

const tabs = [
  { id: "knowledge-bases" as TabId, label: "Knowledge Bases", icon: Database },
  { id: "guardrails" as TabId, label: "Guardrails", icon: Shield },
  { id: "voice-config" as TabId, label: "Voice Configuration", icon: Mic },
  { id: "data-pipelines" as TabId, label: "Data Pipelines", icon: Workflow },
  { id: "apis" as TabId, label: "APIs", icon: Code },
  { id: "analytics" as TabId, label: "Analytics", icon: BarChart3 },
]

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("knowledge-bases")

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-sidebar-border bg-sidebar">
        <div className="flex h-16 items-center border-b border-sidebar-border px-6">
          <h1 className="text-lg font-semibold text-sidebar-foreground">Admin Panel</h1>
        </div>
        <nav className="space-y-1 p-4">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <Icon className="h-5 w-5" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="border-b border-border bg-card">
          <div className="px-8 py-6">
            <h2 className="text-2xl font-semibold text-card-foreground">
              {tabs.find((tab) => tab.id === activeTab)?.label}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeTab === "knowledge-bases"
                ? "Manage data sources connected to your chatbot"
                : activeTab === "guardrails"
                ? "Configure safety and content moderation rules"
                : activeTab === "voice-config"
                ? "Set up voice settings and speech parameters"
                : activeTab === "data-pipelines"
                ? "Manage data processing and integration workflows"
                : activeTab === "analytics"
                ? "View real-time analytics and usage statistics"
                : "Access your API endpoint and test requests"}
            </p>
          </div>
        </div>

        <div className="p-8">
          {activeTab === "knowledge-bases" ? (
            <KnowledgeBasesSection />
          ) : activeTab === "guardrails" ? (
            <GuardrailsSection />
          ) : activeTab === "apis" ? (
            <ApisSection />
          ) : activeTab === "analytics" ? (
            <AnalyticsSection />
          ) : (
            <ComingSoonSection
              section={tabs.find((tab) => tab.id === activeTab)?.label || ""}
            />
          )}
        </div>
      </main>
    </div>
  )
}
