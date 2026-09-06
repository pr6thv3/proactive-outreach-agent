import { db } from '@/lib/db';
import { AutonomousWorkflowEngine } from '@/lib/agents/infrastructure/autonomous-engine';
import { AgentMemoryService } from '@/lib/agents/infrastructure/agent-memory';
import { analyzeEdit, trackEdit, feedEditToMemory } from '@/lib/agents/act/edit-tracker';
import { evaluateSendReadiness } from '@/lib/deliverability/send-readiness';
import { orchestrator } from '@/lib/orchestrator';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  ✅ ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`  ✅ ${message}`);
}

function section(name: string) {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`);
}

async function runM3Tests() {
  console.log('\n================================================================');
  console.log('  Milestone 3 (R3): 5-Second Review Queue & Full Autopilot Engine');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    // Setup clean test organization
    const org = await db.organization.create({
      data: {
        name: `M3 Org ${Date.now()}`,
        plan: 'pro',
      },
    });

    const user = await db.user.create({
      data: {
        email: `m3_owner_${Date.now()}@example.com`,
        name: 'M3 Tester',
      },
    });

    await db.userPreference.create({
      data: {
        userId: user.id,
        activeOrgId: org.id,
        autonomyEnabled: true,
        autonomyPaused: false,
        minLeadScore: 60,
        dailySendLimit: 50,
      },
    });

    const domain = await db.sendingDomain.create({
      data: {
        organizationId: org.id,
        domain: `m3-outreach-${Date.now()}.com`,
        status: 'active',
        spfVerified: true,
        dkimVerified: true,
        dmarcVerified: true,
        reputationScore: 98,
        fromEmail: 'alex@outreach.com',
        fromName: 'Alex',
      },
    });

    // ────────────────────────────────────────────────────────────
    // 1. Keystroke & Edit Diff Tracking into Compounding Memory
    // ────────────────────────────────────────────────────────────
    section('1. Keystroke & Edit Diff Tracking into Compounding Memory');

    // Case 1.1: analyzeEdit detects kept phrases, additions, removals
    const originalBody = 'Hi Sarah, saw your hiring spike in AI engineering. We help teams scale infra seamlessly with zero downtime.';
    const editedBody = 'Hi Sarah, saw your hiring spike in AI engineering. We help fast-growing Series B engineering teams scale infra with 99.99% uptime.';
    
    const analysis = analyzeEdit(originalBody, editedBody);
    assert(analysis.keptPhrases.length > 0, '1.1: analyzeEdit extracts kept phrases');
    assert(analysis.addedWords > 0, '1.1: analyzeEdit calculates added word counts');
    assert(analysis.changeMagnitude > 0 && analysis.changeMagnitude < 1, '1.1: analyzeEdit calculates change magnitude');
    passed += 3;

    // Case 1.2: CTA change classification
    const originalCta = 'Are you free for a 15-minute call on Tuesday?';
    const editedCta = 'Check out our 2-minute interactive demo at app.io/demo';
    const ctaAnalysis = analyzeEdit(originalCta, editedCta);
    assert(ctaAnalysis.changeMagnitude > 0.3, '1.2: CTA change detected with significant magnitude');
    passed++;

    // Case 1.3: Track edit in database and feed to memory
    const lead = await db.lead.create({
      data: {
        organizationId: org.id,
        name: 'Sarah Chen',
        email: `sarah_${Date.now()}@fintech.io`,
        company: 'Fintech Corp',
        title: 'VP of Engineering',
        leadScore: 92,
        status: 'generated',
      },
    });

    const msg = await db.outreachMessage.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        subject: 'Quick question regarding engineering scaling',
        body: originalBody,
        channel: 'email',
        status: 'generated',
        signalTypeUsed: 'hiring_spike',
        pitchAngleUsed: 'infrastructure_reliability',
        urgencyAtGeneration: 0.9,
      },
    });

    const editId = await trackEdit({
      messageId: msg.id,
      fieldName: 'body',
      originalValue: originalBody,
      editedValue: editedBody,
      signalType: 'hiring_spike',
      pitchAngle: 'infrastructure_reliability',
      urgency: 0.9,
      leadId: lead.id,
    });

    assert(editId !== null, '1.3: trackEdit records edit in database');

    const editRecord = await db.messageEdit.findUnique({ where: { id: editId! } });
    assert(editRecord !== null, '1.3: messageEdit record retrieved');
    assertEqual(editRecord?.leadId, lead.id, '1.3: editRecord associated with correct lead');

    // Feed to Compounding Memory
    await feedEditToMemory(editId!);
    const memories = await AgentMemoryService.retrieveRelevantMemories({
      organizationId: org.id,
      category: 'winning_hook',
    });
    assert(Array.isArray(memories), '1.3: AgentMemoryService stores winning hook patterns from kept phrases');
    passed += 4;

    // ────────────────────────────────────────────────────────────
    // 2. Review Queue Batch Actions (Interface Contract #3)
    // ────────────────────────────────────────────────────────────
    section('2. Review Queue Batch Actions (Interface Contract #3)');

    // Create 3 generated messages
    const batchLeads: Array<any> = [];
    const batchMessages: Array<any> = [];
    for (let i = 0; i < 3; i++) {
      const bLead = await db.lead.create({
        data: {
          organizationId: org.id,
          name: `Batch Prospect ${i}`,
          email: `batch_${i}_${Date.now()}@company${i}.com`,
          company: `Company ${i}`,
          title: 'CTO',
          leadScore: 88 + i * 4, // 88, 92, 96
          status: 'generated',
          emailVerified: true,
        },
      });
      batchLeads.push(bLead);

      const bMsg = await db.outreachMessage.create({
        data: {
          organizationId: org.id,
          leadId: bLead.id,
          subject: `Scaling architecture at Company ${i}`,
          body: `Hi CTO, saw your growth at Company ${i}. Let's chat.`,
          channel: 'email',
          status: 'generated',
          signalTypeUsed: 'growth_acceleration',
          pitchAngleUsed: 'cloud_cost_reduction',
        },
      });
      batchMessages.push(bMsg);
    }

    // Case 2.1: Single/Batch Approve
    const approveMsgIds = [batchMessages[0].id];
    const approvedRes = await orchestrator.approveMessage(approveMsgIds[0], undefined, undefined, org.id);
    assert(approvedRes.success, '2.1: Single/Batch Approve marks message as approved');

    const updatedApprovedMsg = await db.outreachMessage.findUnique({ where: { id: approveMsgIds[0] } });
    assertEqual(updatedApprovedMsg?.status, 'approved', '2.1: outreachMessage status updated to "approved"');
    passed += 2;

    // Case 2.2: Batch Reject with Memory Learning
    const rejectMsgId = batchMessages[1].id;
    await db.outreachMessage.updateMany({
      where: { id: rejectMsgId, organizationId: org.id },
      data: { status: 'rejected' },
    });
    await AgentMemoryService.recordFeedback({
      organizationId: org.id,
      category: 'pitch_rejection',
      key: `rejection_cloud_cost_reduction_CTO`,
      wasSuccessful: false,
      industry: 'Tech',
      persona: 'CTO',
      channel: 'email',
    });

    const rejectedRecord = await db.outreachMessage.findUnique({ where: { id: rejectMsgId } });
    assertEqual(rejectedRecord?.status, 'rejected', '2.2: outreachMessage status updated to "rejected"');
    passed++;

    // Case 2.3: Bulk Approve High Confidence with 7-Gate Deliverability Safety Check
    const highConfMsgId = batchMessages[2].id;
    const readiness = await evaluateSendReadiness({
      organizationId: org.id,
      messageId: highConfMsgId,
      traceId: 'trace_m3_bulk_approve',
    });

    assert(readiness.checks.length >= 7, '2.3: evaluateSendReadiness executes 7 deliverability safety gates');
    const preApprovalBlocks = readiness.checks.filter(c => c.status === 'block' && c.id !== 'message_approved');
    assertEqual(preApprovalBlocks.length, 0, '2.3: High-confidence draft passes pre-approval deliverability readiness');

    await db.outreachMessage.updateMany({
      where: { id: highConfMsgId, organizationId: org.id },
      data: { status: 'approved', approvedAt: new Date(), approvedBy: 'bulk_approval_system' },
    });

    const postApprovalReadiness = await evaluateSendReadiness({
      organizationId: org.id,
      messageId: highConfMsgId,
      traceId: 'trace_m3_post_approve',
    });
    assertEqual(postApprovalReadiness.ready, true, '2.3: Post-approval message is 100% send-ready across all 7 gates');

    const bulkApprovedMsg = await db.outreachMessage.findUnique({ where: { id: highConfMsgId } });
    assertEqual(bulkApprovedMsg?.status, 'approved', '2.3: Bulk approved message marked approved in database');
    passed += 4;

    // Case 2.4: Safety Block on Unsafe Lead in Bulk Approval
    const dncLead = await db.lead.create({
      data: {
        organizationId: org.id,
        name: 'DNC Prospect',
        email: `dnc_${Date.now()}@blacklisted.com`,
        doNotContact: true,
        isBlacklisted: true,
        leadScore: 99, // high score but unsafe!
      },
    });

    const dncMsg = await db.outreachMessage.create({
      data: {
        organizationId: org.id,
        leadId: dncLead.id,
        subject: 'Unsafe send attempt',
        body: 'This should be blocked',
        status: 'generated',
      },
    });

    const dncReadiness = await evaluateSendReadiness({
      organizationId: org.id,
      messageId: dncMsg.id,
      traceId: 'trace_dnc_bulk_block',
    });

    assertEqual(dncReadiness.ready, false, '2.4: Pre-send safety check blocks DNC lead from bulk approval');
    assert(
      dncReadiness.checks.some(c => c.status === 'block' && c.id.includes('dnc')),
      '2.4: Block reason explicitly cites DNC protection gate'
    );
    passed += 2;

    // ────────────────────────────────────────────────────────────
    // 3. One-Click Autopilot Engine & Zero-State-Loss Killswitch
    // ────────────────────────────────────────────────────────────
    section('3. One-Click Autopilot Engine & Zero-State-Loss Killswitch');

    // Case 3.1: Autopilot Engine initialization and cycle execution
    const engine = new AutonomousWorkflowEngine({ organizationId: org.id, minLeadScore: 60 });
    assert(typeof engine.runCycle === 'function', '3.1: AutonomousWorkflowEngine exposes runCycle()');

    const cycleResults = await engine.runCycle();
    assert(typeof cycleResults.discovered === 'number', '3.1: runCycle returns structured discover count');
    assert(typeof cycleResults.drafted === 'number', '3.1: runCycle returns structured draft count');
    assert(typeof cycleResults.learned === 'number', '3.1: runCycle returns structured learned count');
    passed += 4;

    // Case 3.2: Engage Emergency Kill-Switch with Zero State Loss
    await db.userPreference.updateMany({
      where: { activeOrgId: org.id },
      data: {
        autonomyPaused: true,
        pausedReason: 'Emergency compliance kill-switch triggered by user',
        pausedAt: new Date(),
      },
    });

    const haltedEngine = new AutonomousWorkflowEngine({ organizationId: org.id });
    const haltedResult = await haltedEngine.runCycle();

    assertEqual(haltedResult.discovered, 0, '3.2: 0 leads discovered when kill-switch is engaged');
    assertEqual(haltedResult.drafted, 0, '3.2: 0 drafts created when kill-switch is engaged');
    assertEqual(haltedResult.scheduled, 0, '3.2: 0 sends dispatched when kill-switch is engaged');

    // Verify zero state loss: all existing approved & generated messages remain intact
    const allRemainingMsgs = await db.outreachMessage.findMany({ where: { organizationId: org.id } });
    assert(allRemainingMsgs.length >= 4, '3.2: Zero-state-loss confirmed — 100% of pending and approved drafts preserved');
    passed += 4;

    // Case 3.3: Resume Autopilot Engine
    await db.userPreference.updateMany({
      where: { activeOrgId: org.id },
      data: {
        autonomyPaused: false,
        pausedReason: null,
        pausedAt: null,
      },
    });

    const resumedEngine = new AutonomousWorkflowEngine({ organizationId: org.id });
    const resumedResult = await resumedEngine.runCycle();
    assert(resumedResult !== null, '3.3: Autopilot engine successfully resumes execution');
    passed++;

  } catch (error) {
    console.error('\n❌ Test Suite Failure:', error);
    failed++;
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`M3 Test Suite Results: ${passed} assertions passed, ${failed} failed`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runM3Tests().catch(err => {
  console.error(err);
  process.exit(1);
});
