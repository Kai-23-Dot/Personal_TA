import SwiftUI

enum ConlearnTheme {
    static let background = Color(hex: "#070A12")
    static let surface = Color(hex: "#0D1220")
    static let elevatedSurface = Color(hex: "#141B2C")
    static let primary = Color(hex: "#8AB4FF")
    static let secondary = Color(hex: "#C4A7FF")
    static let mint = Color(hex: "#62D6B4")
    static let orange = Color(hex: "#FDBA74")
    static let danger = Color(hex: "#FDA4AF")
    static let textPrimary = Color(hex: "#F1F5F9")
    static let textSecondary = Color(hex: "#94A3B8")
    static let border = Color.white.opacity(0.09)
}

extension Color {
    init(hex: String) {
        let sanitized = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: sanitized).scanHexInt64(&value)
        let red: UInt64
        let green: UInt64
        let blue: UInt64
        let alpha: UInt64

        switch sanitized.count {
        case 8:
            red = value >> 24
            green = value >> 16 & 0xFF
            blue = value >> 8 & 0xFF
            alpha = value & 0xFF
        default:
            red = value >> 16
            green = value >> 8 & 0xFF
            blue = value & 0xFF
            alpha = 0xFF
        }

        self.init(
            .sRGB,
            red: Double(red) / 255,
            green: Double(green) / 255,
            blue: Double(blue) / 255,
            opacity: Double(alpha) / 255
        )
    }
}

struct ConlearnBackground: View {
    var body: some View {
        ZStack {
            ConlearnTheme.background
            RadialGradient(
                colors: [ConlearnTheme.primary.opacity(0.13), .clear],
                center: UnitPoint(x: 0.14, y: 0.02),
                startRadius: 20,
                endRadius: 460
            )
            RadialGradient(
                colors: [ConlearnTheme.secondary.opacity(0.08), .clear],
                center: UnitPoint(x: 1, y: 0.15),
                startRadius: 10,
                endRadius: 360
            )
        }
        .ignoresSafeArea()
    }
}

struct SurfaceCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(16)
            .background(ConlearnTheme.surface.opacity(0.92), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(ConlearnTheme.border, lineWidth: 1)
            }
    }
}

struct BrandMark: View {
    var size: CGFloat = 34

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.29, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [ConlearnTheme.primary, ConlearnTheme.secondary],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            Image(systemName: "sparkles")
                .font(.system(size: size * 0.44, weight: .bold))
                .foregroundStyle(ConlearnTheme.background)
        }
        .frame(width: size, height: size)
        .shadow(color: ConlearnTheme.primary.opacity(0.25), radius: 12)
        .accessibilityHidden(true)
    }
}

struct SectionHeading: View {
    let title: String
    var subtitle: String?
    var trailingTitle: String?
    var action: (() -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(ConlearnTheme.textPrimary)
                if let subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(ConlearnTheme.textSecondary)
                }
            }
            Spacer()
            if let trailingTitle, let action {
                Button(trailingTitle, action: action)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ConlearnTheme.primary)
            }
        }
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(ConlearnTheme.background)
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .background(ConlearnTheme.primary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(ConlearnTheme.textPrimary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.white.opacity(configuration.isPressed ? 0.1 : 0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(ConlearnTheme.border, lineWidth: 1)
            }
    }
}

struct StatusPill: View {
    let title: String
    let color: Color

    var body: some View {
        Text(title)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(color.opacity(0.12), in: Capsule())
            .overlay {
                Capsule().stroke(color.opacity(0.24), lineWidth: 1)
            }
    }
}

extension View {
    func conlearnNavigationStyle() -> some View {
        toolbarBackground(ConlearnTheme.background.opacity(0.96), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .tint(ConlearnTheme.primary)
    }
}
