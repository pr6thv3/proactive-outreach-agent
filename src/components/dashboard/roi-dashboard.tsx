'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DollarSign,
  Clock,
  TrendingUp,
  Server,
  Sliders,
  Target,
  MailCheck,
  CalendarCheck,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  CustomerRoiConfig,
  DEFAULT_CUSTOMER_ROI_CONFIG,
  ConfigurableRoiCalculator,
  PartitionedRoiResult,
} from '@/lib/admin/roi-calculator';

export function RoiDashboardCard() {
  // 4 customer-configurable baseline parameters
  const [config, setConfig] = useState<CustomerRoiConfig>(DEFAULT_CUSTOMER_ROI_CONFIG);

  // Partitioned ROI result
  const [roiData, setRoiData] = useState<PartitionedRoiResult | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch initial activity & calculate ROI
  useEffect(() => {
    let isMounted = true;
    async function loadRoi() {
      try {
        const res = await fetch(`/api/admin/roi?rate=${config.hourlyLaborRate}`);
        if (res.ok) {
          const json = await res.json();
          const report = json.data || json;

          if (isMounted) {
            if (report.measuredSavings && report.estimatedSavings) {
              setRoiData(report);
            } else {
              // Backward compatibility calculation
              const calculated = ConfigurableRoiCalculator.calculate(
                {
                  verifiedSends: report.emailsDelivered || 0,
                  qualifiedReplies: report.repliesTriaged || 0,
                  meetingsBooked: report.meetings_booked || report.meetingsBooked || 0,
                  humanReviewHoursSpent: report.humanReviewHoursSpent || 0,
                },
                config
              );
              setRoiData(calculated);
            }
          }
        }
      } catch {
        // Fallback local calculation
        if (isMounted) {
          const local = ConfigurableRoiCalculator.calculate(
            { verifiedSends: 0, qualifiedReplies: 0, meetingsBooked: 0 },
            config
          );
          setRoiData(local);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadRoi();
    return () => {
      isMounted = false;
    };
  }, [config.hourlyLaborRate]);

  // Recalculate whenever customer parameters change
  const handleConfigChange = (field: keyof CustomerRoiConfig, value: number) => {
    const updated = {
      ...config,
      [field]: Math.max(0, value),
    };
    setConfig(updated);

    if (roiData) {
      const recalculated = ConfigurableRoiCalculator.calculate(
        {
          verifiedSends: roiData.measuredSavings.verifiedSends,
          qualifiedReplies: roiData.measuredSavings.qualifiedReplies,
          meetingsBooked: roiData.measuredSavings.meetingsBooked,
          humanReviewHoursSpent: roiData.measuredSavings.humanReviewHoursSpent,
        },
        updated
      );
      setRoiData(recalculated);
    }
  };

  const handleResetBaseline = () => {
    setConfig(DEFAULT_CUSTOMER_ROI_CONFIG);
    if (roiData) {
      const recalculated = ConfigurableRoiCalculator.calculate(
        {
          verifiedSends: roiData.measuredSavings.verifiedSends,
          qualifiedReplies: roiData.measuredSavings.qualifiedReplies,
          meetingsBooked: roiData.measuredSavings.meetingsBooked,
          humanReviewHoursSpent: roiData.measuredSavings.humanReviewHoursSpent,
        },
        DEFAULT_CUSTOMER_ROI_CONFIG
      );
      setRoiData(recalculated);
    }
  };

  if (!roiData) return null;

  const { measuredSavings, estimatedSavings, pipelineEfficiency } = roiData;
  const isZeroActivity =
    measuredSavings.verifiedSends === 0 &&
    measuredSavings.qualifiedReplies === 0 &&
    measuredSavings.meetingsBooked === 0;

  return (
    <div className="space-y-8">
      {/* ─── Top Headline Metric Banner (Tier 2: Estimated Savings) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-emerald-500/30 bg-emerald-950/20 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-300">Net Value Created</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-emerald-400">
              ${estimatedSavings.netSavingsUsd.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Gross labor saved minus platform automation costs
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-300">Manual Hours Saved</CardTitle>
            <Clock className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-blue-400">
              {estimatedSavings.hoursSaved} hrs
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Across {measuredSavings.verifiedSends} verified sends & {measuredSavings.qualifiedReplies} replies
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-300">Automation ROI</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-purple-400">
              +{estimatedSavings.roiPercentage}%
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {estimatedSavings.paybackDays > 0
                ? `Measured payback in ~${estimatedSavings.paybackDays} days`
                : 'Zero synthetic padding'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-300">Platform Cost</CardTitle>
            <Server className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-200">
              ${estimatedSavings.totalAutomationCostUsd}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              AI tokens ($0.003/msg) + email delivery ($0.001/send)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── 4 Pipeline Efficiency & Unit Economics Metrics ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-400" />
            Pipeline Velocity & Unit Economics
          </h3>
          <Badge variant="outline" className="border-slate-700 text-slate-300 text-[10px]">
            Empirical Output
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400 font-medium">Qualified Reply Rate</span>
              <MailCheck className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <div className="text-xl font-bold text-slate-100 font-mono">
              {(pipelineEfficiency.qualifiedReplyRate * 100).toFixed(1)}%
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {measuredSavings.qualifiedReplies} replies / {measuredSavings.verifiedSends || 1} sends
            </p>
          </Card>

          <Card className="border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400 font-medium">Meetings Booked</span>
              <CalendarCheck className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-emerald-400 font-mono">
              {pipelineEfficiency.meetingsBooked}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Verified calendar conversions
            </p>
          </Card>

          <Card className="border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400 font-medium">Hours Saved / Meeting</span>
              <Clock className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-bold text-purple-400 font-mono">
              {pipelineEfficiency.hoursSavedPerMeeting} hrs
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Efficiency per booked demo
            </p>
          </Card>

          <Card className="border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400 font-medium">Cost / Qualified Meeting</span>
              <DollarSign className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-amber-400 font-mono">
              ${pipelineEfficiency.costPerQualifiedMeeting}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Automation cost per confirmed meeting
            </p>
          </Card>
        </div>
      </div>

      {/* ─── 3 Transparent Tiers Breakdown ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tier 1: Measured Savings (Observed Platform Actions) */}
        <Card className="border-slate-800 bg-slate-900 shadow-md">
          <CardHeader className="pb-3 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                Tier 1: Measured Savings (Observed Activity)
              </CardTitle>
              <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px]">
                Ground Truth Records
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-400">
              Direct counts of verified platform actions. Zero synthetic padding or fabricated counts.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {isZeroActivity && (
              <div className="p-3 rounded-lg border border-slate-800 bg-slate-950 text-xs text-slate-400 flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-400 shrink-0" />
                <span>
                  <strong>0 Measured Activity:</strong> Fresh workspace reporting real 0 savings. Launch an outreach campaign to populate ground-truth metrics.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Prospects Researched</span>
                <span className="text-base font-bold text-slate-100 font-mono mt-0.5 block">
                  {measuredSavings.leadsResearched}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Verified Sends Delivered</span>
                <span className="text-base font-bold text-slate-100 font-mono mt-0.5 block">
                  {measuredSavings.verifiedSends}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Inbound Replies Triaged</span>
                <span className="text-base font-bold text-slate-100 font-mono mt-0.5 block">
                  {measuredSavings.qualifiedReplies}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Human Review Deck Time</span>
                <span className="text-base font-bold text-slate-100 font-mono mt-0.5 block">
                  {measuredSavings.humanReviewHoursSpent} hrs
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400">
              <strong className="text-slate-300">Mathematical Formula:</strong>
              <div className="font-mono text-slate-300 mt-1">
                Gross Hours = (Sends × ({config.researchMinutesPerLead}m + {config.copyMinutesPerLead}m) + Replies × {config.replyMinutes}m) / 60
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tier 3: Customer-Provided Assumptions (4 Configurable Parameters) */}
        <Card className="border-slate-800 bg-slate-900 shadow-md">
          <CardHeader className="pb-3 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Sliders className="h-4 w-4 text-blue-400" />
                Tier 3: Customer-Provided Assumptions
              </CardTitle>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleResetBaseline}
                className="h-7 text-[11px] text-blue-400 hover:text-blue-300 hover:bg-slate-800 px-2"
              >
                <RotateCcw className="mr-1 h-3 w-3" /> Reset to Baseline
              </Button>
            </div>
            <CardDescription className="text-xs text-slate-400">
              Tune 4 baseline parameters to model savings based on your team&apos;s actual manual sales routine.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Param 1: Research Minutes */}
              <div className="space-y-1.5">
                <Label htmlFor="researchMin" className="text-xs font-semibold text-slate-300">
                  Research Time / Lead (min)
                </Label>
                <Input
                  id="researchMin"
                  type="number"
                  min="0"
                  value={config.researchMinutesPerLead}
                  onChange={(e) => handleConfigChange('researchMinutesPerLead', parseFloat(e.target.value) || 0)}
                  className="border-slate-800 bg-slate-950 text-slate-100 text-xs font-mono"
                />
                <span className="text-[10px] text-slate-500 block">Baseline: 18 min (prospect + signal research)</span>
              </div>

              {/* Param 2: Copywriting Minutes */}
              <div className="space-y-1.5">
                <Label htmlFor="copyMin" className="text-xs font-semibold text-slate-300">
                  Copywriting Time / Lead (min)
                </Label>
                <Input
                  id="copyMin"
                  type="number"
                  min="0"
                  value={config.copyMinutesPerLead}
                  onChange={(e) => handleConfigChange('copyMinutesPerLead', parseFloat(e.target.value) || 0)}
                  className="border-slate-800 bg-slate-950 text-slate-100 text-xs font-mono"
                />
                <span className="text-[10px] text-slate-500 block">Baseline: 10 min (drafting + personalization)</span>
              </div>

              {/* Param 3: Reply Minutes */}
              <div className="space-y-1.5">
                <Label htmlFor="replyMin" className="text-xs font-semibold text-slate-300">
                  Reply Triage Time (min)
                </Label>
                <Input
                  id="replyMin"
                  type="number"
                  min="0"
                  value={config.replyMinutes}
                  onChange={(e) => handleConfigChange('replyMinutes', parseFloat(e.target.value) || 0)}
                  className="border-slate-800 bg-slate-950 text-slate-100 text-xs font-mono"
                />
                <span className="text-[10px] text-slate-500 block">Baseline: 12 min (inbound classification + response)</span>
              </div>

              {/* Param 4: Hourly Labor Rate */}
              <div className="space-y-1.5">
                <Label htmlFor="hourlyLaborRate" className="text-xs font-semibold text-slate-300">
                  Rep Hourly Labor Rate ($/hr)
                </Label>
                <Input
                  id="hourlyLaborRate"
                  type="number"
                  min="0"
                  value={config.hourlyLaborRate}
                  onChange={(e) => handleConfigChange('hourlyLaborRate', parseFloat(e.target.value) || 0)}
                  className="border-slate-800 bg-slate-950 text-slate-100 text-xs font-mono"
                />
                <span className="text-[10px] text-slate-500 block">Baseline: $45/hr (BDR / SDR fully loaded cost)</span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950 text-[11px] text-slate-400 border border-slate-800 flex items-center justify-between">
              <span>Customer Assumption Status:</span>
              <Badge variant="outline" className="text-[10px] border-blue-800 text-blue-300">
                Fully Tunable & Transparent
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
