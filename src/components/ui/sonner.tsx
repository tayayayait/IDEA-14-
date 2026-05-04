import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast as sonnerToast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    setIsMobile(media.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={isMobile ? "bottom-center" : "top-right"}
      visibleToasts={3}
      closeButton
      className="toaster group"
      toastOptions={{
        duration: 4000,
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

const toast = ((message: Parameters<typeof sonnerToast>[0], data?: Parameters<typeof sonnerToast>[1]) =>
  sonnerToast(message, data)) as typeof sonnerToast;

toast.success = (message, data) => sonnerToast.success(message, { duration: 3000, ...data });
toast.warning = (message, data) => sonnerToast.warning(message, { duration: 5000, ...data });
toast.error = (message, data) => sonnerToast.error(message, { duration: Infinity, closeButton: true, ...data });

toast.dismiss = sonnerToast.dismiss;
toast.loading = sonnerToast.loading;
toast.message = sonnerToast.message;
toast.promise = sonnerToast.promise;
toast.custom = sonnerToast.custom;

export { Toaster, toast };
