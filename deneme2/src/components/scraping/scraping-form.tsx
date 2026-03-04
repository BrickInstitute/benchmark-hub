"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useStartScraping } from "@/hooks/use-scraping";
import { SUPPORTED_SITES } from "@/lib/constants";

interface ScrapingFormProps {
  onJobStarted?: (jobId: string) => void;
}

export function ScrapingForm({ onJobStarted }: ScrapingFormProps) {
  const [url, setUrl] = useState("");
  const [site, setSite] = useState("generic");
  const [maxItems, setMaxItems] = useState(20);
  const { startScraping, isStarting, error } = useStartScraping();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    try {
      const result = await startScraping(url, site, maxItems);
      onJobStarted?.(result.jobId);
      setUrl("");
    } catch {
      // Error handled by hook
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Hedef URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://mobbin.com/browse/ios/apps"
          className="w-full px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Site Tipi
          </label>
          <Select
            options={SUPPORTED_SITES.map((s) => ({ value: s.value, label: s.label }))}
            value={site}
            onChange={(e) => setSite(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Maks. Item
          </label>
          <input
            type="number"
            value={maxItems}
            onChange={(e) => setMaxItems(parseInt(e.target.value) || 20)}
            min={1}
            max={200}
            className="w-full px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <Button type="submit" disabled={isStarting || !url}>
        {isStarting ? "Baslatiliyor..." : "Scraping Baslat"}
      </Button>
    </form>
  );
}
