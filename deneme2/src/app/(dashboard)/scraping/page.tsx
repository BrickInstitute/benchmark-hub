"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrapingForm } from "@/components/scraping/scraping-form";
import { JobList } from "@/components/scraping/job-list";
import { SourceManager } from "@/components/scraping/source-manager";

export default function ScrapingPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Scraping</h1>
        <p className="text-sm text-muted mt-1">
          UI benchmark sitelerinden otomatik veri toplama
        </p>
      </div>

      {/* Otomatik Scraping Kaynaklari */}
      <SourceManager />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Manuel tek seferlik scraping */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-ink">Tek Seferlik Scraping</h2>
          </CardHeader>
          <CardContent>
            <ScrapingForm />
          </CardContent>
        </Card>

        {/* Job gecmisi */}
        <div>
          <h2 className="font-semibold text-ink mb-4">Scraping Gecmisi</h2>
          <JobList />
        </div>
      </div>

      {/* Cron bilgisi */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-ink">Zamanlanmis Scraping (Cron)</h2>
        </CardHeader>
        <CardContent className="text-sm text-ink-2 space-y-2">
          <p>
            Otomatik zamanlanmis scraping icin asagidaki endpoint&apos;i cron job olarak ayarlayın:
          </p>
          <code className="block bg-surface-3 px-3 py-2 rounded text-xs">
            POST /api/scraping/cron?schedule=daily&key=YOUR_API_KEY
          </code>
          <p className="text-xs text-muted">
            Railway Cron Job veya harici servisler (cron-job.org) ile kullanabilirsiniz.
            <br />
            &bull; <code>?schedule=daily</code> - Gunluk kaynakları calistir
            <br />
            &bull; <code>?schedule=weekly</code> - Haftalik kaynaklari calistir
            <br />
            &bull; <code>?all=true</code> - Tum aktif kaynaklari calistir
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
