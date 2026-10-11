
/* =========================================================
   QUOVA HUB — VERSION 1.4
   Developer Toolkit Catalog
   Search • Categories • Installer Registry • Offline Status
   Signature Status • Checksum Status • Custom Dialogs
   Service Worker • Offline Installer Downloads
========================================================= */

"use strict";

const Quova = {
  version: "1.4",
  packages: [],
  installers: [],
  activeCategory: "All",
  searchQuery: "",
  offlineOnly: false,
  elements: {},

  /* =======================================================
     1. INITIALIZATION
  ======================================================= */

  init: async function () {
    console.info(`[Quova] Starting Quova Hub v${Quova.version}...`);

    try {
      Quova.checkElements();
      Quova.bindEvents();
      Quova.updateConnectionStatus();

      await Quova.loadInstallers();
      await Quova.loadPackages();

      Quova.renderCategories();
      Quova.renderPackages();
      Quova.updateCatalogMessage();

      Quova.registerServiceWorker();

      console.info("[Quova] Application ready.");
    } catch (error) {
      console.error("[Quova] APPLICATION STARTUP FAILED:", error);

      Quova.showMessage(
        "Quova Hub could not start completely. Check the browser console for details.",
        "error"
      );

      Quova.showDialog({
        title: "Startup problem",
        message: "Quova Hub could not finish loading.",
        details: error?.message || "An unexpected error occurred.",
        icon: "fa-circle-exclamation",
        tone: "error",
        confirmLabel: "Understood",
        showCancel: false
      });
    }
  },

  /* =======================================================
     2. REQUIRED ELEMENTS
  ======================================================= */

  checkElements: function () {
    const requiredIds = [
      "toolGrid",
      "toolCount",
      "catalogMessage",
      "searchInput",
      "categoryList",
      "connectionStatus",
      "connectionText",
      "filterButton",
      "settingsButton"
    ];

    const missing = [];

    requiredIds.forEach(function (id) {
      const element = document.getElementById(id);
      Quova.elements[id] = element;

      if (!element) missing.push(id);
    });

    if (missing.length) {
      throw new Error(
        "Missing required HTML element(s): " + missing.join(", ")
      );
    }

    console.info("[Quova] Required HTML elements found.");
  },

  /* =======================================================
     3. EVENT LISTENERS
  ======================================================= */

  bindEvents: function () {
    const elements = Quova.elements;

    elements.searchInput.addEventListener("input", function (event) {
      Quova.searchQuery = event.target.value.trim().toLowerCase();
      Quova.renderPackages();
    });

    elements.categoryList.addEventListener("click", function (event) {
      const chip = event.target.closest("[data-category]");
      if (!chip) return;

      Quova.activeCategory = chip.dataset.category || "All";
      Quova.renderCategories();
      Quova.renderPackages();
    });

    elements.filterButton.addEventListener("click", function () {
      Quova.offlineOnly = !Quova.offlineOnly;

      elements.filterButton.classList.toggle(
        "is-active",
        Quova.offlineOnly
      );

      elements.filterButton.setAttribute(
        "aria-pressed",
        String(Quova.offlineOnly)
      );

      Quova.renderPackages();

      Quova.showMessage(
        Quova.offlineOnly
          ? "Showing tools registered as offline-ready."
          : "Showing all catalog tools.",
        "info"
      );
    });

    elements.settingsButton.addEventListener("click", function () {
      Quova.showDialog({
        title: "Quova Hub settings",
        message: "Your developer toolkit, built for offline readiness.",
        details:
          `Application version: ${Quova.version}\n` +
          `Catalog packages: ${Quova.packages.length}\n` +
          `Registered installers: ${Quova.installers.length}\n` +
          `Connection: ${navigator.onLine ? "Online" : "Offline"}\n\n` +
          "Verification labels report recorded checks. Quova Hub does not independently run Windows Authenticode verification.",
        icon: "fa-sliders",
        confirmLabel: "Got it",
        showCancel: false
      });
    });

    document.addEventListener("keydown", function (event) {
      const isMac = navigator.platform.toLowerCase().includes("mac");

      if (
        (isMac ? event.metaKey : event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        elements.searchInput.focus();
        elements.searchInput.select();
      }

      if (event.key === "Escape") {
        elements.searchInput.blur();
      }
    });

    window.addEventListener("online", function () {
      Quova.updateConnectionStatus();
      Quova.showMessage("Internet connection restored.", "success");
    });

    window.addEventListener("offline", function () {
      Quova.updateConnectionStatus();
      Quova.showMessage(
        "You are offline. Only locally available resources can be used.",
        "warning"
      );
    });

    console.info("[Quova] Event listeners initialized.");
  },

  /* =======================================================
     4. LOAD INSTALLER REGISTRY
  ======================================================= */

  loadInstallers: async function () {
    try {
      const response = await fetch("./data/installers.json", {
        cache: "no-cache"
      });

      if (!response.ok) {
        throw new Error(
          `Installer registry returned HTTP ${response.status}.`
        );
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        Quova.installers = data;
      } else if (data && Array.isArray(data.installers)) {
        Quova.installers = data.installers;
      } else {
        throw new Error(
          "Installer registry must contain an installers array."
        );
      }

      console.info(
        `[Quova] ${Quova.installers.length} installer record(s) loaded.`
      );

      console.table(
        Quova.installers.map(function (installer) {
          return {
            id: installer.id || "Missing ID",
            version: installer.version || "Not specified",
            offlineAvailable: installer.offlineAvailable === true,
            signatureStatus:
              installer.digitalSignature?.status || "not recorded",
            checksumStatus:
              installer.checksumVerification?.status || "not recorded",
            independentlyVerified:
              installer.checksumVerification?.independentlyVerified === true
          };
        })
      );
    } catch (error) {
      console.error("[Quova] Could not load installer registry:", error);

      Quova.installers = [];

      Quova.showMessage(
        "The installer registry could not be loaded. Online catalog links may still work.",
        "warning"
      );
    }
  },

  /* =======================================================
     5. LOAD PACKAGE CATALOG
  ======================================================= */

  loadPackages: async function () {
    try {
      const response = await fetch("./data/packages.json", {
        cache: "no-cache"
      });

      if (!response.ok) {
        throw new Error(
          `Package catalog returned HTTP ${response.status}.`
        );
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("The package catalog must be a JSON array.");
      }

      Quova.packages = data.filter(function (item) {
        return (
          item &&
          typeof item === "object" &&
          typeof item.id === "string" &&
          typeof item.name === "string"
        );
      });

      console.info(
        `[Quova] ${Quova.packages.length} package(s) loaded.`
      );

      console.table(
        Quova.packages.map(function (item) {
          return {
            id: item.id,
            name: item.name,
            category: item.category || "Other",
            valid: Boolean(item.id && item.name)
          };
        })
      );

      if (!Quova.packages.length) {
        throw new Error(
          "No valid packages were found in data/packages.json."
        );
      }
    } catch (error) {
      console.error("[Quova] Could not load package catalog:", error);

      Quova.packages = [];
      Quova.elements.toolGrid.replaceChildren();
      Quova.elements.toolCount.textContent = "0 tools";

      Quova.showMessage(
        "Could not load the package catalog. Check that data/packages.json exists and contains valid JSON.",
        "error"
      );

      throw error;
    }
  },

  /* =======================================================
     6. CONNECTION STATUS
  ======================================================= */

  updateConnectionStatus: function () {
    const isOnline = navigator.onLine;
    const status = Quova.elements.connectionStatus;
    const text = Quova.elements.connectionText;

    status.classList.toggle("is-online", isOnline);
    status.classList.toggle("is-offline", !isOnline);
    status.setAttribute("aria-label", isOnline ? "Online" : "Offline");

    text.textContent = isOnline ? "Online" : "Offline";
  },

  /* =======================================================
     7. CATEGORIES
  ======================================================= */

  getCategories: function () {
    const categories = Quova.packages
      .map(function (item) {
        return item.category || "Other";
      })
      .filter(Boolean);

    return ["All", ...new Set(categories)];
  },

  renderCategories: function () {
    const container = Quova.elements.categoryList;
    container.replaceChildren();

    Quova.getCategories().forEach(function (category) {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "category-chip";
      button.dataset.category = category;
      button.textContent = category;

      const isActive = category === Quova.activeCategory;

      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));

      container.appendChild(button);
    });
  },

  /* =======================================================
     8. INSTALLER LOOKUP AND VERIFICATION
  ======================================================= */

  getInstaller: function (item) {
    return Quova.installers.find(function (installer) {
      return installer.id === item.id;
    }) || null;
  },

  hasLocalInstallerFields: function (installer) {
    return Boolean(
      installer &&
      typeof installer.fileName === "string" &&
      installer.fileName.trim() &&
      typeof installer.relativePath === "string" &&
      installer.relativePath.trim()
    );
  },

  isOfflineReady: function (item) {
    const installer = Quova.getInstaller(item);

    return Boolean(
      installer &&
      installer.offlineAvailable === true &&
      Quova.hasLocalInstallerFields(installer)
    );
  },

  /*
   * This reads the registry's recorded verification results.
   * It does not run Authenticode or hash verification in the browser.
   */

  getVerificationInfo: function (item) {
    const installer = Quova.getInstaller(item);

    if (!installer) {
      return {
        signatureValid: false,
        checksumVerified: false,
        registryVerified: false,
        label: "Online download required",
        className: "online-required",
        details: "No local installer is registered."
      };
    }

    const signatureValid =
      installer.digitalSignature?.status === "valid";

    const checksum = installer.checksumVerification || {};

    const checksumVerified =
      checksum.independentlyVerified === true &&
      ["verified", "match", "matched"].includes(
        String(checksum.status || "").toLowerCase()
      );

    /*
     * Require both independent checksum verification and the
     * registry's verified flag before describing the installer
     * as fully verified.
     */
    const registryVerified =
      installer.verified === true &&
      checksumVerified;

    if (registryVerified) {
      return {
        signatureValid,
        checksumVerified,
        registryVerified: true,
        label: "Installer verified",
        className: "available",
        details:
          "The registry records a verified checksum and a fully verified installer status."
      };
    }

    if (signatureValid && checksumVerified) {
      return {
        signatureValid: true,
        checksumVerified: true,
        registryVerified: false,
        label: "Signature and checksum valid",
        className: "available",
        details:
          "The registry records a valid digital signature and an independently verified checksum. Full installer verification has not been enabled in the registry."
      };
    }

    if (signatureValid) {
      return {
        signatureValid: true,
        checksumVerified: false,
        registryVerified: false,
        label: "Signature valid · checksum pending",
        className: "verification-needed",
        details:
          "Windows Authenticode verification was reported as valid. The SHA-256 checksum has not yet been independently compared with a trusted publisher value."
      };
    }

    if (checksumVerified) {
      return {
        signatureValid: false,
        checksumVerified: true,
        registryVerified: false,
        label: "Checksum verified · signature unchecked",
        className: "verification-needed",
        details:
          "The registry records an independently verified checksum, but no valid digital signature is recorded."
      };
    }

    return {
      signatureValid: false,
      checksumVerified: false,
      registryVerified: false,
      label: "Verification needed",
      className: "verification-needed",
      details:
        "The installer is registered, but a trusted checksum comparison has not been recorded."
    };
  },

  isInstallerVerified: function (item) {
    return Quova.getVerificationInfo(item).registryVerified;
  },

  getAvailability: function (item) {
    const installer = Quova.getInstaller(item);

    if (
      installer &&
      installer.offlineAvailable === true &&
      Quova.hasLocalInstallerFields(installer)
    ) {
      const verification = Quova.getVerificationInfo(item);

      return {
        label: verification.label,
        className: verification.className,
        details: verification.details
      };
    }

    return {
      label: "Online download required",
      className: "online-required",
      details:
        "No local installer is registered. An internet connection may be required."
    };
  },

  /* =======================================================
     9. FILTER PACKAGES
  ======================================================= */

  getFilteredPackages: function () {
    return Quova.packages.filter(function (item) {
      const category = item.category || "Other";

      const matchesCategory =
        Quova.activeCategory === "All" ||
        category === Quova.activeCategory;

      const searchableText = [
        item.name,
        item.description,
        item.category,
        item.platform,
        item.architecture,
        item.license,
        ...(Array.isArray(item.tags) ? item.tags : [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !Quova.searchQuery ||
        searchableText.includes(Quova.searchQuery);

      const matchesOffline =
        !Quova.offlineOnly ||
        Quova.isOfflineReady(item);

      return matchesCategory && matchesSearch && matchesOffline;
    });
  },

  /* =======================================================
     10. RENDER CATALOG
  ======================================================= */

  renderPackages: function () {
    const container = Quova.elements.toolGrid;
    const filtered = Quova.getFilteredPackages();

    container.replaceChildren();

    Quova.elements.toolCount.textContent =
      `${filtered.length} ${filtered.length === 1 ? "tool" : "tools"}`;

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";

      const heading = document.createElement("h3");
      heading.textContent = "No tools found";

      const description = document.createElement("p");
      description.textContent =
        "Try another search term, select a different category, or turn off the offline-ready filter.";

      empty.append(heading, description);
      container.appendChild(empty);
      return;
    }

    filtered.forEach(function (item) {
      container.appendChild(Quova.createPackageCard(item));
    });
  },

  /* =======================================================
     11. BUILD TOOL CARD
  ======================================================= */

  createPackageCard: function (item) {
    const card = document.createElement("article");
    card.className = "tool-card";

    const top = document.createElement("div");
    top.className = "tool-card-top";

    const logo = document.createElement("div");
    logo.className = "tool-logo";

    if (item.iconUrl) {
      const image = document.createElement("img");

      image.src = item.iconUrl;
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";

      image.addEventListener("error", function () {
        logo.replaceChildren();

        const fallback = document.createElement("i");
        fallback.className = "fa-solid fa-code";
        fallback.setAttribute("aria-hidden", "true");

        logo.appendChild(fallback);
      }, { once: true });

      logo.appendChild(image);
    } else {
      const fallback = document.createElement("i");
      fallback.className = "fa-solid fa-code";
      fallback.setAttribute("aria-hidden", "true");
      logo.appendChild(fallback);
    }

    const category = document.createElement("span");
    category.className = "tool-category";
    category.textContent = item.category || "Other";

    top.append(logo, category);

    const name = document.createElement("h3");
    name.className = "tool-name";
    name.textContent = item.name;

    const description = document.createElement("p");
    description.className = "tool-description";
    description.textContent = item.description || "Developer tool.";

    const meta = document.createElement("div");
    meta.className = "tool-meta";

    [
      item.version ? `Version ${item.version}` : null,
      item.platform || null,
      item.architecture || null,
      item.license || null
    ].filter(Boolean).forEach(function (value) {
      const tag = document.createElement("span");
      tag.className = "tool-tag";
      tag.textContent = value;
      meta.appendChild(tag);
    });

    const footer = document.createElement("div");
    footer.className = "tool-card-footer";

    const availability = Quova.getAvailability(item);

    const availabilityLabel = document.createElement("span");
    availabilityLabel.className =
      "availability-label " + availability.className;
    availabilityLabel.textContent = availability.label;
    availabilityLabel.title = availability.details;
    availabilityLabel.setAttribute("tabindex", "0");
    availabilityLabel.setAttribute("aria-label", availability.details);

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "tool-download";
    downloadButton.textContent = "Get tool";
    downloadButton.setAttribute("aria-label", `Get ${item.name}`);

    downloadButton.addEventListener("click", function () {
      Quova.openPackageSource(item);
    });

    footer.append(availabilityLabel, downloadButton);
    card.append(top, name, description, meta, footer);

    return card;
  },

  /* =======================================================
     12. CATALOG MESSAGES
  ======================================================= */

  showMessage: function (message, type = "info") {
    const container = Quova.elements.catalogMessage;
    if (!container) return;

    container.textContent = message;
    container.dataset.type = type;
    container.classList.add("is-visible");
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
  },

  updateCatalogMessage: function () {
    if (navigator.onLine) {
      Quova.showMessage(
        "Catalog loaded. Check each tool's availability and verification status before downloading.",
        "success"
      );
    } else {
      Quova.showMessage(
        "You are offline. Local files may be available; online download pages require an internet connection.",
        "warning"
      );
    }
  },

  /* =======================================================
     13. CUSTOM DIALOG SYSTEM
  ======================================================= */

  showDialog: function ({
    title = "Quova Hub",
    message = "",
    details = "",
    icon = "fa-circle-info",
    tone = "normal",
    confirmLabel = "Continue",
    cancelLabel = "Cancel",
    showCancel = true
  } = {}) {
    return new Promise(function (resolve) {
      let dialog = document.getElementById("quovaCustomDialog");

      if (!dialog) {
        const styles = document.createElement("style");
        styles.id = "quovaDialogStyles";

        styles.textContent = `
          #quovaCustomDialog {
            width: min(440px, calc(100% - 32px));
            max-width: 440px;
            max-height: min(85vh, 700px);
            padding: 0;
            border: 1px solid #333;
            border-radius: 20px;
            background: #101010;
            color: #f5f5f5;
            box-shadow: 0 24px 90px rgba(0,0,0,.65);
            overflow: auto;
            font-family: inherit;
          }

          #quovaCustomDialog::backdrop {
            background: rgba(0,0,0,.76);
            backdrop-filter: blur(7px);
          }

          #quovaCustomDialog .qv-dialog-content {
            padding: 25px;
          }

          #quovaCustomDialog .qv-dialog-heading {
            display: flex;
            align-items: flex-start;
            gap: 14px;
            margin-bottom: 20px;
          }

          #quovaCustomDialog .qv-dialog-icon {
            width: 46px;
            height: 46px;
            flex: 0 0 46px;
            display: grid;
            place-items: center;
            border-radius: 14px;
            background: #222;
            color: #eee;
            font-size: 19px;
          }

          #quovaCustomDialog[data-tone="warning"] .qv-dialog-icon {
            color: #fbbf24;
            background: rgba(251,191,36,.10);
          }

          #quovaCustomDialog[data-tone="success"] .qv-dialog-icon {
            color: #4ade80;
            background: rgba(74,222,128,.10);
          }

          #quovaCustomDialog[data-tone="error"] .qv-dialog-icon {
            color: #f87171;
            background: rgba(248,113,113,.10);
          }

          #quovaCustomDialog .qv-dialog-title {
            margin: 2px 0 7px;
            font-size: 19px;
            line-height: 1.35;
            font-weight: 650;
            letter-spacing: -.35px;
          }

          #quovaCustomDialog .qv-dialog-message {
            margin: 0;
            color: #c4c4c4;
            font-size: 14px;
            line-height: 1.7;
            overflow-wrap: anywhere;
          }

          #quovaCustomDialog .qv-dialog-details {
            margin-top: 18px;
            padding: 14px;
            border: 1px solid #2d2d2d;
            border-radius: 12px;
            background: #171717;
            color: #a3a3a3;
            font-size: 12px;
            line-height: 1.7;
            overflow-wrap: anywhere;
            white-space: pre-wrap;
          }

          #quovaCustomDialog .qv-dialog-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 24px;
          }

          #quovaCustomDialog .qv-dialog-button {
            min-height: 42px;
            padding: 0 17px;
            border: 1px solid #383838;
            border-radius: 11px;
            background: #1c1c1c;
            color: #eee;
            font: inherit;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: background .18s, border-color .18s;
          }

          #quovaCustomDialog .qv-dialog-button:hover {
            background: #292929;
            border-color: #555;
          }

          #quovaCustomDialog .qv-dialog-button:focus-visible {
            outline: 2px solid #aaa;
            outline-offset: 3px;
          }

          #quovaCustomDialog .qv-dialog-primary {
            background: #f2f2f2;
            color: #111;
            border-color: #f2f2f2;
          }

          #quovaCustomDialog .qv-dialog-primary:hover {
            background: #d9d9d9;
            border-color: #d9d9d9;
          }

          @media (max-width: 420px) {
            #quovaCustomDialog .qv-dialog-content {
              padding: 20px;
            }

            #quovaCustomDialog .qv-dialog-actions {
              flex-direction: column-reverse;
            }

            #quovaCustomDialog .qv-dialog-button {
              width: 100%;
            }
          }
        `;

        document.head.appendChild(styles);

        dialog = document.createElement("dialog");
        dialog.id = "quovaCustomDialog";
        dialog.setAttribute("aria-labelledby", "qvDialogTitle");
        dialog.setAttribute("aria-describedby", "qvDialogMessage");
        document.body.appendChild(dialog);

        dialog.addEventListener("cancel", function (event) {
          event.preventDefault();

          if (typeof dialog._quovaFinish === "function") {
            dialog._quovaFinish(false);
          }
        });

        dialog.addEventListener("click", function (event) {
          if (event.target === dialog &&
              typeof dialog._quovaFinish === "function") {
            dialog._quovaFinish(false);
          }
        });
      }

      if (typeof dialog.showModal !== "function") {
        resolve(window.confirm(`${title}\n\n${message}`));
        return;
      }

      if (dialog.open && typeof dialog._quovaFinish === "function") {
        dialog._quovaFinish(false);
      }

      dialog.replaceChildren();
      dialog.dataset.tone = tone;

      const content = document.createElement("div");
      content.className = "qv-dialog-content";

      const heading = document.createElement("div");
      heading.className = "qv-dialog-heading";

      const iconBox = document.createElement("div");
      iconBox.className = "qv-dialog-icon";

      const iconElement = document.createElement("i");
      iconElement.className = `fa-solid ${icon}`;
      iconElement.setAttribute("aria-hidden", "true");
      iconBox.appendChild(iconElement);

      const headingText = document.createElement("div");
      headingText.style.flex = "1";

      const titleElement = document.createElement("h2");
      titleElement.id = "qvDialogTitle";
      titleElement.className = "qv-dialog-title";
      titleElement.textContent = title;

      const messageElement = document.createElement("p");
      messageElement.id = "qvDialogMessage";
      messageElement.className = "qv-dialog-message";
      messageElement.textContent = message;

      headingText.append(titleElement, messageElement);
      heading.append(iconBox, headingText);
      content.appendChild(heading);

      if (details) {
        const detailsElement = document.createElement("div");
        detailsElement.className = "qv-dialog-details";
        detailsElement.textContent = details;
        content.appendChild(detailsElement);
      }

      const actions = document.createElement("div");
      actions.className = "qv-dialog-actions";

      let finished = false;

      const finish = function (result) {
        if (finished) return;

        finished = true;
        dialog._quovaFinish = null;

        if (dialog.open) dialog.close();
        resolve(result);
      };

      dialog._quovaFinish = finish;

      if (showCancel) {
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "qv-dialog-button";
        cancelButton.textContent = cancelLabel;
        cancelButton.addEventListener("click", function () {
          finish(false);
        });
        actions.appendChild(cancelButton);
      }

      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className =
        "qv-dialog-button qv-dialog-primary";
      confirmButton.textContent = confirmLabel;
      confirmButton.addEventListener("click", function () {
        finish(true);
      });

      actions.appendChild(confirmButton);
      content.appendChild(actions);
      dialog.appendChild(content);

      dialog.showModal();
      confirmButton.focus();
    });
  },

  /* =======================================================
     14. OPEN PACKAGE SOURCE OR DOWNLOAD LOCAL INSTALLER
  ======================================================= */

  openPackageSource: async function (item) {
    const installer = Quova.getInstaller(item);

    const hasLocalFile = Boolean(
      installer &&
      installer.offlineAvailable === true &&
      Quova.hasLocalInstallerFields(installer)
    );

    if (hasLocalFile) {
      const verification = Quova.getVerificationInfo(item);

      const details =
        `File: ${installer.fileName}\n` +
        `Version: ${installer.version || "Not specified"}\n` +
        `Platform: ${installer.platform || "Windows"} (${installer.architecture || "x64"})\n` +
        `Digital signature: ${verification.signatureValid ? "Recorded as valid by Windows" : "Not recorded as valid"}\n` +
        `Independent checksum verification: ${verification.checksumVerified ? "Passed according to registry" : "Pending"}\n\n` +
        "Quova Hub displays the verification details recorded in its registry. It does not independently verify the Windows signature in your browser.";

      const proceed = await Quova.showDialog({
        title: verification.signatureValid
          ? "Local installer available"
          : "Installer security check",

        message: verification.signatureValid
          ? `${item.name} has a locally registered installer and a recorded valid digital signature.`
          : `${item.name} has a locally registered installer, but complete verification has not been recorded.`,

        details,
        icon: "fa-shield-halved",
        tone: verification.signatureValid ? "normal" : "warning",
        confirmLabel: "Download installer",
        cancelLabel: "Cancel"
      });

      if (!proceed) return;

      const link = document.createElement("a");
      link.href = installer.relativePath;
      link.download = installer.fileName;
      link.hidden = true;

      document.body.appendChild(link);
      link.click();
      link.remove();

      console.info(
        "[Quova] Local installer download requested:",
        installer.fileName
      );

      return;
    }

    const source = item.packageUrl;

    if (
      typeof source !== "string" ||
      !/^https:\/\//i.test(source)
    ) {
      await Quova.showDialog({
        title: "Download source unavailable",
        message:
          `Quova Hub doesn't have a valid HTTPS download source for ${item.name}.`,
        details: "Check the packageUrl field in data/packages.json.",
        icon: "fa-circle-exclamation",
        tone: "error",
        confirmLabel: "Understood",
        showCancel: false
      });

      return;
    }

    const newTab = window.open("about:blank", "_blank");

    const proceed = await Quova.showDialog({
      title: "Open download source",
      message:
        `Quova Hub will open the listed download source for ${item.name}.`,
      details:
        "An internet connection may be required. Check that the destination is the official website before downloading or installing anything.",
      icon: "fa-arrow-up-right-from-square",
      confirmLabel: "Open source",
      cancelLabel: "Cancel"
    });

    if (!proceed) {
      if (newTab && !newTab.closed) newTab.close();
      return;
    }

    if (newTab && !newTab.closed) {
      newTab.opener = null;
      newTab.location.href = source;
    } else {
      await Quova.showDialog({
        title: "New tab blocked",
        message: "Your browser blocked the new tab.",
        details:
          "Allow popups for your local Quova Hub page, then try again.",
        icon: "fa-window-maximize",
        tone: "warning",
        confirmLabel: "OK",
        showCancel: false
      });
    }
  },

  /* =======================================================
     15. SERVICE WORKER
  ======================================================= */

  registerServiceWorker: function () {
    if (!("serviceWorker" in navigator)) {
      console.info(
        "[Quova] Service workers are not supported in this browser."
      );
      return;
    }

    if (
      location.protocol !== "https:" &&
      location.hostname !== "localhost" &&
      location.hostname !== "127.0.0.1"
    ) {
      console.info(
        "[Quova] Service worker requires HTTPS or localhost."
      );
      return;
    }

    navigator.serviceWorker
      .register("./service-worker.js")
      .then(function (registration) {
        console.info(
          "[Quova] Service worker registered:",
          registration.scope
        );
      })
      .catch(function (error) {
        console.error(
          "[Quova] Service worker registration failed:",
          error
        );
      });
  }
};

/* =========================================================
   16. START APPLICATION
========================================================= */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    Quova.init();
  }, { once: true });
} else {
  Quova.init();
}
