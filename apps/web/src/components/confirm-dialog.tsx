import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

type ConfirmOptions = {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
};

type ConfirmContextType = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmContextType | null>(null);

export function useConfirm() {
  const context = React.useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{
    isOpen: boolean;
    options: ConfirmOptions | null;
    resolver: ((val: boolean) => void) | null;
  }>({
    isOpen: false,
    options: null,
    resolver: null,
  });

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({
        isOpen: true,
        options,
        resolver: resolve,
      });
    });
  }, []);

  const handleClose = React.useCallback(() => {
    if (state.resolver) {
      state.resolver(false);
    }
    setState({ isOpen: false, options: null, resolver: null });
  }, [state.resolver]);

  const handleConfirm = React.useCallback(() => {
    if (state.resolver) {
      state.resolver(true);
    }
    setState({ isOpen: false, options: null, resolver: null });
  }, [state.resolver]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={state.isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        {state.options && (
          <AlertDialogContent size="default">
            <AlertDialogHeader>
              <AlertDialogTitle>{state.options.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {state.options.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleClose}>
                {state.options.cancelText || "Cancel"}
              </AlertDialogCancel>
              <AlertDialogAction
                variant={state.options.variant || "default"}
                onClick={handleConfirm}
              >
                {state.options.confirmText || "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
