import { Theme, ThemeUIStyleObject } from "theme-ui";

const baseColors = {
    blue: "#6378EF",
    purple: "#723FC6",
    cyan: "#17BEBB",
    green: "#5beab7",
    yellow: "#FFC145",
    red: "#FF6B6C",
    lightRed: "#FF6B6C"
};

const colors = {
    primary: baseColors.blue,
    secondary: baseColors.purple,
    accent: baseColors.blue,

    success: baseColors.green,
    warning: baseColors.yellow,
    danger: baseColors.red,
    dangerHover: baseColors.lightRed,
    info: baseColors.blue,
    invalid: "pink",

    text: "#293147",
    background: "#F8F8F8",
    muted: "#eaebed"
};

const badge: ThemeUIStyleObject = {
    border: 0,
    borderRadius: 16,
    p: 1,
    px: 2,
    fontSize: 1,
    fontWeight: "body"
};

const buttonBase: ThemeUIStyleObject = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",

    ":enabled": { cursor: "pointer" }
};

const button: ThemeUIStyleObject = {
    ...buttonBase,

    px: "32px",
    py: "12px",

    color: "white",
    border: 1,
    borderRadius: 16,

    fontWeight: "bold",

    ":disabled": {
        opacity: 0.5
    }
};

const buttonOutline = (color: string, hoverColor: string): ThemeUIStyleObject => ({
    color,
    borderColor: color,
    background: "none",

    ":enabled:hover": {
        color: "background",
        bg: hoverColor,
        borderColor: hoverColor
    }
});

const iconButton: ThemeUIStyleObject = {
    ...buttonBase,

    padding: 0,
    width: "40px",
    height: "40px",

    background: "none",

    ":disabled": {
        color: "text",
        opacity: 0.25
    }
};

const cardHeadingFontSize = 18.7167;

const cardGapX = [0, 3, 4];
const cardGapY = 3;

const card: ThemeUIStyleObject = {
    position: "relative",
    mt: cardGapY,
    mb: cardGapY,
    borderColor: "background",
    borderRadius: 16,
    boxShadow: "0px 4px 8px #723fc61a"
};

const infoCard: ThemeUIStyleObject = {
    ...card,

    padding: 3,
    boxShadow: "0px 4px 5px #F2F4FF",
    // backgroundColor: "rgba(3, 216, 195, 0.03)",
    backgroundColor: "#F2F4FF",

    h2: {
        mb: 2,
        fontSize: cardHeadingFontSize
    }
};

const formBase: ThemeUIStyleObject = {
    display: "block",
    width: "auto",
    flexShrink: 0,
    padding: 2,
    fontSize: 3
};

const formCell: ThemeUIStyleObject = {
    ...formBase,

    bg: "background",
    border: 1,
    borderColor: "muted",
    borderRadius: 16,
    // boxShadow: [1, 2]
};

const overlay: ThemeUIStyleObject = {
    position: "absolute",

    left: 0,
    top: 0,
    width: "100%",
    height: "100%"
};

const modalOverlay: ThemeUIStyleObject = {
    position: "fixed",

    left: 0,
    top: 0,
    // width: "100vw",
    height: "100vh"
};

const theme: Theme = {
    breakpoints: ["48em", "52em", "64em"],

    space: [0, 4, 8, 16, 32, 64, 128, 256, 512],

    fonts: {
        body: "Visby CF",
        heading: "inherit",
        monospace: "Menlo, monospace"
    },

    fontSizes: [12, 14, 16, 20, 24, 32, 48, 64, 96],

    fontWeights: {
        body: 400,
        heading: 600,

        light: 200,
        medium: 400,
        bold: 600
    },

    lineHeights: {
        body: 1.5,
        heading: 1.25
    },

    colors,

    borders: [0, "1px solid", "2px solid"],

    shadows: ["0", "0px 4px 8px rgba(41, 49, 71, 0.1)", "0px 8px 16px rgba(41, 49, 71, 0.1)"],

    text: {
        address: {
            fontFamily: "monospace",
            fontSize: 1
        }
    },

    badges: {
        muted: {
            ...badge,

            backgroundColor: "muted",
            color: "text",
        },

        colors: {
            ...badge,

            color: "white",
            backgroundColor: "#414c6b",
            background: "linear-gradient(135deg, #6378EF 0%, #723FC6 85%)",
        },

        outline: {
            ...badge,

            border: 2,
            color: "accent",
            backgroundColor: "transparent",

        }
    },

    buttons: {
        primary: {
            ...button,

            bg: "primary",
            borderColor: "primary",

            ":enabled:hover": {
                bg: "secondary",
                borderColor: "secondary"
            }
        },

        outline: {
            ...button,
            ...buttonOutline("primary", "secondary")
        },

        outlineAccent: {
            ...button,
            ...buttonOutline("accent", "secondary"),
        },

        cancel: {
            ...button,
            ...buttonOutline("text", "text"),

            opacity: 0.8
        },

        danger: {
            ...button,

            bg: "danger",
            borderColor: "danger",

            ":enabled:hover": {
                bg: "dangerHover",
                borderColor: "dangerHover"
            }
        },

        token: {
            ...button,
            ...buttonOutline("accent", "accent")
        },

        icon: {
            ...iconButton,
            color: "primary",
            ":enabled:hover": { color: "accent" }
        },

        dangerIcon: {
            ...iconButton,
            color: "danger",
            ":enabled:hover": { color: "dangerHover" }
        },

        titleIcon: {
            ...iconButton,
            color: "text",
            ":enabled:hover": { color: "success" }
        },

        connect: {
            ...button,

            color: "white",
            backgroundColor: "secondary",
            transition: "border 200ms",

            ":enabled:hover": {
                border: 1,
                borderColor: "accent"
            }
        },

        colors: {
            ...button,

            color: "white",
            backgroundColor: "#414c6b",
            background: "linear-gradient(135deg, #6378EF 0%, #723FC6 85%)",
            transition: "border 200ms",

            ":enabled:hover": {
                border: 1,
                borderColor: "accent"
            },
        }
    },

    cards: {
        primary: {
            ...card,

            padding: 0,

            borderColor: "muted",
            bg: "white",

            "> h2": {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",

                height: "56px",

                pl: 3,
                py: 2,
                pr: 2,

                // bg: "muted",

                fontSize: cardHeadingFontSize
            }
        },

        info: {
            ...infoCard,

            border: 1,
            color: "accent",

            // display: ["none", "block"]
        },

        infoPopup: {
            ...infoCard,

            position: "fixed",
            top: 0,
            right: 3,
            left: 3,
            mt: "72px",
            height: "80%",
            overflowY: "scroll"
        },

        tooltip: {
            padding: 2,

            border: 1,
            borderColor: "muted",
            borderRadius: "4px",
            bg: "background",
            boxShadow: 1,

            fontSize: 1,
            color: "text",
            fontWeight: "body",
            zIndex: 1
        },

        tooltipInfo: {
            padding: 2,
            borderRadius: "12px",
            boxShadow: 1,
            bg: "#F2F4FF",
            color: "accent",

            zIndex: 1
        },

        userAccountModal: {
            ...card,

            mt: 0,
            padding: 3,
            bg: "white",
            border: 2,
        }
    },

    forms: {
        label: {
            ...formBase
        },

        unit: {
            ...formCell,

            textAlign: "center",
            border: 0,
            bg: "none",
            // bg: "muted"
        },

        input: {
            ...formCell,

            flex: 1
        },

        editor: {}
    },

    layout: {
        header: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "stretch",

            position: ["fixed", "relative"],
            // width: "100vw",
            top: 0,
            zIndex: 1,

            px: [2, "12px", "12px", 5],
            py: [2, "12px", "12px"],

            // ...headerGradient,
            // boxShadow: [1, "none"]
        },

        footer: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            mt: cardGapY,
            px: 3,
            minHeight: "72px",

            bg: "muted"
        },

        main: {
            width: "100%",
            maxWidth: "912px",
            mx: "auto",
            mt: ["40px", "20px"],
            mb: ["40px", "40px"],
            px: cardGapX
        },

        columns: {
            display: "flex",
            flexWrap: "wrap",
            justifyItems: "center",
            p: [2, 0]
        },

        single: {
            width: ["100%", "56%"]
        },

        left: {
            pr: cardGapX,
            width: ["100%", "58%"]
        },

        right: {
            width: ["100%", "42%"]
        },

        actions: {
            justifyContent: "flex-end",
            mt: 2,

            button: {
                ml: 2
            }
        },

        disabledOverlay: {
            ...overlay,

            bg: "rgba(255, 255, 255, 0.5)"
        },

        userOverlay: {
            ...modalOverlay,

            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            p: [2, 0],
        },

        blurFilter: {
            position: "fixed",
            left: 0,
            top: 0,
            zIndex: 1,
            width: "100%",
            height: "100%",
            background: "rgba(250, 250, 250, 0.6)",
            backdropFilter: "blur(3px)",
            pointerEvents: "none"
        },

        modal: {
            padding: 3,
            width: ["100%", "40em"]
        },

        infoOverlay: {
            ...modalOverlay,

            display: ["block", "none"],

            bg: "rgba(255, 255, 255, 0.8)"
        },

        infoMessage: {
            display: "flex",
            justifyContent: "center",
            m: 3,
            alignItems: "center",
            minWidth: "128px"
        },

        sidenav: {
            display: ["flex", "none"],
            flexDirection: "column",
            p: 0,
            m: 0,
            borderColor: "muted",
            mr: "0",
            height: "100%",
            // ...headerGradient
        },

    },

    styles: {
        root: {
            fontFamily: "body",
            lineHeight: "body",
            fontWeight: "body",

            height: "100%",

            "#root": {
                height: "100%"
            }
        },

        a: {
            color: "primary",
            ":hover": { color: "accent" },
            textDecoration: "none",
            fontWeight: "bold"
        }
    },

    links: {
        nav: {
            px: 2,
            py: 1,
            fontWeight: "medium",
            fontSize: 2,
            textTransform: "uppercase",
            letterSpacing: "2px",
            width: ["100%", "auto"],
            mt: [3, "auto"]
        }
    }
};

export default theme;
