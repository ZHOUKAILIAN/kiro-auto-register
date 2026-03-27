import crypto from 'node:crypto';

import type {
  ManualOtpSubmitResult,
  PendingOtpState,
  RegisterDiagnostics,
  RegisterRuntimeState,
  RegistrationFailureSummary
} from '../shared/contracts.ts';

interface PendingOtpResolver {
  taskId: string;
  resolve: (otp: string) => void;
  reject: (error: Error) => void;
}

export class RegisterRuntimeController {
  private state: RegisterRuntimeState = {
    isRegistering: false
  };

  private pendingResolver?: PendingOtpResolver;

  getState(): RegisterRuntimeState {
    return {
      ...this.state,
      pendingOtp: this.state.pendingOtp ? { ...this.state.pendingOtp } : undefined,
      latestDiagnostics: this.state.latestDiagnostics
        ? {
            ...this.state.latestDiagnostics,
            egress: this.state.latestDiagnostics.egress
              ? { ...this.state.latestDiagnostics.egress }
              : undefined,
            tempmail: { ...this.state.latestDiagnostics.tempmail },
            managedEmail: this.state.latestDiagnostics.managedEmail
              ? { ...this.state.latestDiagnostics.managedEmail }
              : undefined,
            mailbox: this.state.latestDiagnostics.mailbox
              ? { ...this.state.latestDiagnostics.mailbox }
              : undefined,
            registrationProbe: this.state.latestDiagnostics.registrationProbe
              ? {
                  ...this.state.latestDiagnostics.registrationProbe,
                  evidence: this.state.latestDiagnostics.registrationProbe.evidence
                    ? {
                        ...this.state.latestDiagnostics.registrationProbe.evidence,
                        cookieNames: this.state.latestDiagnostics.registrationProbe.evidence.cookieNames
                          ? [...this.state.latestDiagnostics.registrationProbe.evidence.cookieNames]
                          : undefined,
                        stageTrace: this.state.latestDiagnostics.registrationProbe.evidence.stageTrace.map(
                          (entry) => ({ ...entry })
                        )
                      }
                    : undefined
                }
              : undefined,
            registrationComparisons: this.state.latestDiagnostics.registrationComparisons?.map(
              (comparison) => ({
                ...comparison,
                result: comparison.result
                  ? {
                      ...comparison.result,
                      evidence: comparison.result.evidence
                        ? {
                            ...comparison.result.evidence,
                            cookieNames: comparison.result.evidence.cookieNames
                              ? [...comparison.result.evidence.cookieNames]
                              : undefined,
                            stageTrace: comparison.result.evidence.stageTrace.map((entry) => ({
                              ...entry
                            }))
                          }
                        : undefined
                    }
                  : undefined
              })
            ),
            browserObservation: this.state.latestDiagnostics.browserObservation
              ? {
                  ...this.state.latestDiagnostics.browserObservation,
                  latestInterestingEvents: [
                    ...this.state.latestDiagnostics.browserObservation.latestInterestingEvents
                  ],
                  latestNetworkHits: this.state.latestDiagnostics.browserObservation.latestNetworkHits.map(
                    (hit) => ({ ...hit })
                  )
                }
              : undefined,
            aws: this.state.latestDiagnostics.aws ? { ...this.state.latestDiagnostics.aws } : undefined
          }
        : undefined,
      lastFailure: this.state.lastFailure ? { ...this.state.lastFailure } : undefined
    };
  }

  setRegistering(value: boolean): void {
    this.state = {
      ...this.state,
      isRegistering: value
    };
  }

  setDiagnostics(diagnostics: RegisterDiagnostics): void {
    this.state = {
      ...this.state,
      latestDiagnostics: diagnostics
    };
  }

  recordFailure(failure: RegistrationFailureSummary): void {
    this.state = {
      ...this.state,
      lastFailure: failure
    };
  }

  clearFailure(): void {
    this.state = {
      ...this.state,
      lastFailure: undefined
    };
  }

  async requestManualOtp(input: {
    registerIndex: number;
    email: string;
  }): Promise<string> {
    this.clearPendingOtp('验证码任务已被新的请求覆盖');

    const pendingOtp: PendingOtpState = {
      taskId: crypto.randomUUID(),
      registerIndex: input.registerIndex,
      email: input.email,
      requestedAt: Date.now(),
      source: 'manual'
    };

    this.state = {
      ...this.state,
      pendingOtp
    };

    return new Promise<string>((resolve, reject) => {
      this.pendingResolver = {
        taskId: pendingOtp.taskId,
        resolve,
        reject
      };
    });
  }

  submitManualOtp(taskId: string, otp: string): ManualOtpSubmitResult {
    const pendingOtp = this.state.pendingOtp;
    const normalizedOtp = otp.trim();

    if (!pendingOtp || !this.pendingResolver || this.pendingResolver.taskId !== taskId) {
      return {
        success: false,
        message: '当前没有匹配的验证码任务'
      };
    }

    if (!/^\d{6}$/.test(normalizedOtp)) {
      return {
        success: false,
        message: '验证码必须是 6 位数字'
      };
    }

    const resolver = this.pendingResolver;
    this.pendingResolver = undefined;
    this.state = {
      ...this.state,
      pendingOtp: undefined
    };
    resolver.resolve(normalizedOtp);

    return {
      success: true,
      message: `验证码已提交: ${normalizedOtp}`
    };
  }

  clearPendingOtp(message: string = '验证码任务已取消'): void {
    if (this.pendingResolver) {
      this.pendingResolver.reject(new Error(message));
      this.pendingResolver = undefined;
    }

    if (this.state.pendingOtp) {
      this.state = {
        ...this.state,
        pendingOtp: undefined
      };
    }
  }
}
