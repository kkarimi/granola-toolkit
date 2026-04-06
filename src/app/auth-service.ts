import type { DefaultGranolaAuthController } from "../client/default.ts";

import type { GranolaAppAuthMode, GranolaAppAuthState, GranolaAppState } from "./types.ts";

interface GranolaAuthServiceDependencies {
  authController?: DefaultGranolaAuthController;
  emitStateUpdate: () => void;
  resetRemoteState: () => void;
  state: GranolaAppState;
}

export class GranolaAuthService {
  constructor(private readonly deps: GranolaAuthServiceDependencies) {}

  async inspectAuth(): Promise<GranolaAppAuthState> {
    if (!this.deps.authController) {
      return { ...this.deps.state.auth };
    }

    const auth = await this.deps.authController.inspect();
    return this.applyAuthState(auth);
  }

  async loginAuth(
    options: { apiKey?: string; supabasePath?: string } = {},
  ): Promise<GranolaAppAuthState> {
    const controller = this.requireAuthController();

    try {
      const auth = await controller.login(options);
      return this.applyAuthState(auth, {
        resetDocuments: true,
      });
    } catch (error) {
      const auth = await controller.inspect();
      this.applyAuthState(auth);
      throw error;
    }
  }

  async logoutAuth(): Promise<GranolaAppAuthState> {
    const auth = await this.requireAuthController().logout();
    return this.applyAuthState(auth, {
      resetDocuments: true,
    });
  }

  async refreshAuth(): Promise<GranolaAppAuthState> {
    const controller = this.requireAuthController();

    try {
      const auth = await controller.refresh();
      return this.applyAuthState(auth, {
        resetDocuments: true,
      });
    } catch (error) {
      const auth = await controller.inspect();
      this.applyAuthState(auth);
      throw error;
    }
  }

  async switchAuthMode(mode: GranolaAppAuthMode): Promise<GranolaAppAuthState> {
    const controller = this.requireAuthController();

    try {
      const auth = await controller.switchMode(mode);
      return this.applyAuthState(auth, {
        resetDocuments: true,
      });
    } catch (error) {
      const auth = await controller.inspect();
      this.applyAuthState(auth);
      throw error;
    }
  }

  private requireAuthController(): DefaultGranolaAuthController {
    if (!this.deps.authController) {
      throw new Error("Granola auth control is not configured");
    }

    return this.deps.authController;
  }

  private applyAuthState(
    auth: GranolaAppAuthState,
    options: {
      resetDocuments?: boolean;
    } = {},
  ): GranolaAppAuthState {
    if (options.resetDocuments) {
      this.deps.resetRemoteState();
    }

    this.deps.state.auth = { ...auth };
    this.deps.emitStateUpdate();
    return { ...auth };
  }
}
