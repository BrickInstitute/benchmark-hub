"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SUPPORTED_SITES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const scheduleOptions = [
  { value: "daily", label: "Gunluk" },
  { value: "weekly", label: "Haftalik" },
  { value: "manual", label: "Manuel" },
];

export function SourceManager() {
  const { data, mutate } = useSWR("/api/scraping/sources", fetcher);
  const sources = data?.data || [];

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [site, setSite] = useState("generic");
  const [maxItems, setMaxItems] = useState(20);
  const [schedule, setSchedule] = useState("daily");
  const [isBulkRunning, setIsBulkRunning] = useState(false);

  const handleAdd = async () => {
    if (!name || !url) return;
    await fetch("/api/scraping/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url, site, maxItems, schedule }),
    });
    setName("");
    setUrl("");
    setShowForm(false);
    mutate();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch(`/api/scraping/sources/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    mutate();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/scraping/sources/${id}`, { method: "DELETE" });
    mutate();
  };

  const handleBulkScrape = async () => {
    setIsBulkRunning(true);
    try {
      const apiKey = prompt("API Key giriniz:");
      if (!apiKey) return;
      await fetch(`/api/scraping/cron?all=true&key=${apiKey}`, {
        method: "POST",
      });
      alert("Toplu scraping baslatildi! Job listesini kontrol edin.");
    } finally {
      setIsBulkRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h2 className="font-semibold text-gray-900">Scraping Kaynaklari</h2>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleBulkScrape}
            disabled={isBulkRunning || sources.length === 0}
          >
            {isBulkRunning ? "Calisiyor..." : "Tumunu Tara"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Iptal" : "Kaynak Ekle"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="space-y-3 mb-6 p-4 bg-gray-50 rounded-lg">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kaynak adi (orn: Dribbble UI Shots)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="URL (orn: https://dribbble.com/shots/popular)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="grid grid-cols-3 gap-3">
              <Select
                options={[
                  ...SUPPORTED_SITES.map((s) => ({ value: s.value, label: s.label })),
                  { value: "dribbble-api", label: "Dribbble API" },
                ]}
                value={site}
                onChange={(e) => setSite(e.target.value)}
              />
              <Select
                options={scheduleOptions}
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
              />
              <input
                type="number"
                value={maxItems}
                onChange={(e) => setMaxItems(parseInt(e.target.value) || 20)}
                min={1}
                max={200}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Maks item"
              />
            </div>
            <Button onClick={handleAdd} size="sm" disabled={!name || !url}>
              Kaydet
            </Button>
          </div>
        )}

        {sources.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            Henuz kaynak eklenmedi. &quot;Kaynak Ekle&quot; ile baslayın.
          </p>
        ) : (
          <div className="space-y-2">
            {sources.map((source: {
              id: string;
              name: string;
              url: string;
              site: string;
              enabled: boolean;
              schedule: string;
              maxItems: number;
              lastRunAt: string | null;
              lastRunStatus: string | null;
              totalCollected: number;
            }) => (
              <div
                key={source.id}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${source.enabled ? "bg-green-500" : "bg-gray-300"}`} />
                    <span className="font-medium text-sm text-gray-900">{source.name}</span>
                    <Badge>{source.site}</Badge>
                    <Badge variant={source.schedule === "daily" ? "info" : source.schedule === "weekly" ? "warning" : "default"}>
                      {source.schedule}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">{source.url}</p>
                  {source.lastRunAt && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Son: {formatDate(source.lastRunAt)} -{" "}
                      <span className={source.lastRunStatus === "success" ? "text-green-500" : "text-red-500"}>
                        {source.lastRunStatus}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-xs text-gray-400">{source.maxItems} item</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(source.id, source.enabled)}
                  >
                    {source.enabled ? "Durdur" : "Etkinlestir"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(source.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Sil
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
