"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface AIFeedbackPanelProps {
  feedback: string;
  strengths: string[] | null;
  improvements: string[] | null;
}

export function AIFeedbackPanel({ feedback, strengths, improvements }: AIFeedbackPanelProps) {
  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">AI Analizi</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{feedback}</p>

        {strengths && strengths.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">
              Guclu Yonler
            </h4>
            <ul className="space-y-1">
              {strengths.map((item, i) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                  <span className="text-green-500 font-bold mt-0.5">+</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {improvements && improvements.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-2">
              Gelistirme Alanlari
            </h4>
            <ul className="space-y-1">
              {improvements.map((item, i) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                  <span className="text-orange-500 font-bold mt-0.5">!</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
