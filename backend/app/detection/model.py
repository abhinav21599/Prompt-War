import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional

class ConvBlock(nn.Module):
    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.conv(x)

class ResNetBasicBlock(nn.Module):
    expansion = 1

    def __init__(self, in_planes: int, planes: int, stride: int = 1):
        super().__init__()
        self.conv1 = nn.Conv2d(in_planes, planes, kernel_size=3, stride=stride, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(planes)
        self.conv2 = nn.Conv2d(planes, planes, kernel_size=3, stride=1, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(planes)

        self.shortcut = nn.Sequential()
        if stride != 1 or in_planes != self.expansion * planes:
            self.shortcut = nn.Sequential(
                nn.Conv2d(in_planes, self.expansion * planes, kernel_size=1, stride=stride, bias=False),
                nn.BatchNorm2d(self.expansion * planes),
            )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out += self.shortcut(x)
        return F.relu(out)

class ResNet34Encoder(nn.Module):
    """
    Self-contained ResNet-34 encoder for SAR feature extraction.
    Layers: [3, 4, 6, 3] residual blocks across 4 resolution stages.
    """
    def __init__(self, in_channels: int = 1):
        super().__init__()
        self.in_planes = 64
        # Initial SAR convolution
        self.conv1 = nn.Conv2d(in_channels, 64, kernel_size=7, stride=2, padding=3, bias=False)
        self.bn1 = nn.BatchNorm2d(64)
        self.relu = nn.ReLU(inplace=True)
        self.maxpool = nn.MaxPool2d(kernel_size=3, stride=2, padding=1)

        self.layer1 = self._make_layer(64, 3, stride=1)
        self.layer2 = self._make_layer(128, 4, stride=2)
        self.layer3 = self._make_layer(256, 6, stride=2)
        self.layer4 = self._make_layer(512, 3, stride=2)

    def _make_layer(self, planes: int, num_blocks: int, stride: int) -> nn.Sequential:
        strides = [stride] + [1] * (num_blocks - 1)
        layers = []
        for s in strides:
            layers.append(ResNetBasicBlock(self.in_planes, planes, s))
            self.in_planes = planes * ResNetBasicBlock.expansion
        return nn.Sequential(*layers)

    def forward(self, x: torch.Tensor):
        x0 = self.relu(self.bn1(self.conv1(x)))  # 1/2
        x1 = self.layer1(self.maxpool(x0))       # 1/4
        x2 = self.layer2(x1)                     # 1/8
        x3 = self.layer3(x2)                     # 1/16
        x4 = self.layer4(x3)                     # 1/32
        return x0, x1, x2, x3, x4

class DecoderBlock(nn.Module):
    def __init__(self, in_ch: int, skip_ch: int, out_ch: int):
        super().__init__()
        self.up = nn.ConvTranspose2d(in_ch, out_ch, kernel_size=2, stride=2)
        self.conv = ConvBlock(out_ch + skip_ch, out_ch)

    def forward(self, x: torch.Tensor, skip: Optional[torch.Tensor] = None) -> torch.Tensor:
        x = self.up(x)
        if skip is not None:
            if x.shape[2:] != skip.shape[2:]:
                x = F.interpolate(x, size=skip.shape[2:], mode="bilinear", align_corners=False)
            x = torch.cat([x, skip], dim=1)
        return self.conv(x)

class UNetResNet34(nn.Module):
    """
    U-Net with ResNet-34 Encoder for SAR Oil Spill Segmentation.
    Outputs raw logits (apply sigmoid for binary probability).
    Supports binary (num_classes=1) and multi-class (num_classes=3: sea, oil, look-alike).
    """
    def __init__(self, in_channels: int = 1, num_classes: int = 1):
        super().__init__()
        self.in_channels = in_channels
        self.num_classes = num_classes
        self.encoder = ResNet34Encoder(in_channels=in_channels)

        # Decoder blocks with skip connections
        self.dec4 = DecoderBlock(512, 256, 256)
        self.dec3 = DecoderBlock(256, 128, 128)
        self.dec2 = DecoderBlock(128, 64, 64)
        self.dec1 = DecoderBlock(64, 64, 32)
        self.final_up = nn.ConvTranspose2d(32, 16, kernel_size=2, stride=2)
        self.final_conv = nn.Sequential(
            nn.Conv2d(16, 16, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(16, num_classes, kernel_size=1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        input_size = x.shape[2:]
        x0, x1, x2, x3, x4 = self.encoder(x)

        d4 = self.dec4(x4, x3)
        d3 = self.dec3(d4, x2)
        d2 = self.dec2(d3, x1)
        d1 = self.dec1(d2, x0)
        out = self.final_up(d1)
        out = self.final_conv(out)

        if out.shape[2:] != input_size:
            out = F.interpolate(out, size=input_size, mode="bilinear", align_corners=False)
        return out

    def predict_probability(self, x: torch.Tensor) -> torch.Tensor:
        self.eval()
        with torch.no_grad():
            logits = self.forward(x)
            if self.num_classes == 1:
                return torch.sigmoid(logits)
            else:
                return F.softmax(logits, dim=1)
