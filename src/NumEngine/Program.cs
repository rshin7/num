using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace NumEngine;

public static partial class CalculatorExports
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    [JSExport]
    public static string EvaluateWorkbook(string source)
    {
        source ??= string.Empty;
        var variables = new Dictionary<string, Quantity>(StringComparer.OrdinalIgnoreCase);
        var results = new List<LineResult>();
        Quantity? total = null;

        foreach (var originalLine in source.Replace("\r\n", "\n").Split('\n'))
        {
            var expression = originalLine.Split('#', 2)[0].Trim();
            if (string.IsNullOrEmpty(expression))
            {
                results.Add(LineResult.Empty());
                continue;
            }

            try
            {
                var assignment = Assignment.Match(expression);
                Quantity value;
                if (assignment.Success)
                {
                    value = new ExpressionParser(assignment.Groups[2].Value, variables).Parse();
                    variables[assignment.Groups[1].Value] = value;
                }
                else
                {
                    value = new ExpressionParser(expression, variables).Parse();
                    total = total is null ? value : Quantity.Add(total.Value, value);
                }

                results.Add(new LineResult(Format(value), false));
            }
            catch (CalculatorException error)
            {
                results.Add(new LineResult(error.Message, true));
            }
            catch
            {
                results.Add(new LineResult("Invalid expression", true));
            }
        }

        return JsonSerializer.Serialize(new WorkbookResult(results, total is null ? "0" : Format(total.Value)), JsonOptions);
    }

    private static readonly Regex Assignment = new(
        @"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static string Format(Quantity quantity)
    {
        var amount = quantity.Amount.ToString("#,0.############################", CultureInfo.InvariantCulture);
        return quantity.Currency is null ? amount : quantity.Currency + amount;
    }

    public static void Main() { }
}

public sealed record WorkbookResult(IReadOnlyList<LineResult> Results, string Total);
public sealed record LineResult(string Display, bool IsError)
{
    public static LineResult Empty() => new(string.Empty, false);
}

public readonly record struct Quantity(decimal Amount, string? Currency)
{
    public static Quantity Add(Quantity left, Quantity right) =>
        new(left.Amount + right.Amount, ResolveCurrency(left, right));

    public static Quantity Subtract(Quantity left, Quantity right) =>
        new(left.Amount - right.Amount, ResolveCurrency(left, right));

    public static Quantity Multiply(Quantity left, Quantity right)
    {
        if (left.Currency is not null && right.Currency is not null)
            throw new CalculatorException("Can't multiply two currencies");

        return new Quantity(left.Amount * right.Amount, left.Currency ?? right.Currency);
    }

    public static Quantity Divide(Quantity left, Quantity right)
    {
        if (right.Amount == 0)
            throw new CalculatorException("Can't divide by zero");
        if (left.Currency is null && right.Currency is not null)
            throw new CalculatorException("Can't divide by a currency");

        return new Quantity(left.Amount / right.Amount, left.Currency == right.Currency ? null : left.Currency);
    }

    private static string? ResolveCurrency(Quantity left, Quantity right)
    {
        if (left.Currency is null) return right.Currency;
        if (right.Currency is null || left.Currency == right.Currency) return left.Currency;
        throw new CalculatorException("Currencies don't match");
    }
}

public sealed class ExpressionParser
{
    private readonly string input;
    private readonly IReadOnlyDictionary<string, Quantity> variables;
    private int position;

    public ExpressionParser(string input, IReadOnlyDictionary<string, Quantity> variables)
    {
        this.input = input;
        this.variables = variables;
    }

    public Quantity Parse()
    {
        var result = ParseAddSubtract();
        SkipSpace();
        if (position != input.Length)
            throw Error("Unexpected character");
        return result;
    }

    private Quantity ParseAddSubtract()
    {
        var result = ParseMultiplyDivide();
        while (true)
        {
            if (Take('+')) result = Quantity.Add(result, ParseMultiplyDivide());
            else if (Take('-')) result = Quantity.Subtract(result, ParseMultiplyDivide());
            else return result;
        }
    }

    private Quantity ParseMultiplyDivide()
    {
        var result = ParseUnary();
        while (true)
        {
            if (Take('*')) result = Quantity.Multiply(result, ParseUnary());
            else if (Take('/')) result = Quantity.Divide(result, ParseUnary());
            else return result;
        }
    }

    private Quantity ParseUnary()
    {
        if (Take('+')) return ParseUnary();
        if (Take('-'))
        {
            var item = ParseUnary();
            return item with { Amount = -item.Amount };
        }
        return ParsePostfix();
    }

    private Quantity ParsePostfix()
    {
        var result = ParsePrimary();
        while (Take('%'))
            result = result with { Amount = result.Amount / 100m };
        return result;
    }

    private Quantity ParsePrimary()
    {
        SkipSpace();
        var currency = TakeCurrency();
        if (currency is not null)
        {
            var amount = ParsePrimary();
            if (amount.Currency is not null)
                throw Error("Unexpected currency");
            return amount with { Currency = currency };
        }

        if (Take('('))
        {
            var result = ParseAddSubtract();
            if (!Take(')')) throw Error("Missing )");
            return result;
        }

        if (position < input.Length && (char.IsDigit(input[position]) || input[position] == '.'))
            return new Quantity(ParseNumber(), null);

        if (position < input.Length && (char.IsLetter(input[position]) || input[position] == '_'))
        {
            var name = ParseIdentifier();
            if (Take('(')) return ParseFunction(name);
            if (!variables.TryGetValue(name, out var value))
                throw Error($"Unknown name: {name}");
            return value;
        }

        throw Error("Expected a number");
    }

    private Quantity ParseFunction(string name)
    {
        var values = new List<Quantity>();
        if (!Take(')'))
        {
            do { values.Add(ParseAddSubtract()); } while (Take(','));
            if (!Take(')')) throw Error("Missing )");
        }

        return name.ToLowerInvariant() switch
        {
            "abs" when values.Count == 1 => values[0] with { Amount = Math.Abs(values[0].Amount) },
            "round" when values.Count is 1 or 2 => Round(values),
            "min" when values.Count > 0 => Fold(values, decimal.Min),
            "max" when values.Count > 0 => Fold(values, decimal.Max),
            _ => throw Error($"Unknown function: {name}")
        };
    }

    private Quantity Round(List<Quantity> values)
    {
        var decimals = values.Count == 2 ? (int)values[1].Amount : 0;
        if (decimals is < 0 or > 28 || values.Count == 2 && values[1].Currency is not null)
            throw Error("Invalid number of decimals");
        return values[0] with { Amount = Math.Round(values[0].Amount, decimals, MidpointRounding.AwayFromZero) };
    }

    private Quantity Fold(List<Quantity> values, Func<decimal, decimal, decimal> operation)
    {
        var result = values[0];
        foreach (var value in values.Skip(1))
            result = new Quantity(operation(result.Amount, value.Amount), ResolveUnit(result, value));
        return result;
    }

    private static string? ResolveUnit(Quantity left, Quantity right)
    {
        if (left.Currency is null) return right.Currency;
        if (right.Currency is null || left.Currency == right.Currency) return left.Currency;
        throw new CalculatorException("Currencies don't match");
    }

    private decimal ParseNumber()
    {
        var start = position;
        var decimalSeen = false;
        while (position < input.Length)
        {
            var ch = input[position];
            if (char.IsDigit(ch)) { position++; continue; }
            if (ch == '.' && !decimalSeen) { decimalSeen = true; position++; continue; }
            if (ch == ',' && IsThousandsSeparator()) { position++; continue; }
            break;
        }

        var text = input[start..position].Replace(",", string.Empty);
        if (!decimal.TryParse(text, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var result))
            throw Error("Invalid number");
        return result;
    }

    private bool IsThousandsSeparator() =>
        position + 3 < input.Length &&
        char.IsDigit(input[position + 1]) &&
        char.IsDigit(input[position + 2]) &&
        char.IsDigit(input[position + 3]) &&
        (position + 4 == input.Length || !char.IsDigit(input[position + 4]));

    private string ParseIdentifier()
    {
        var start = position++;
        while (position < input.Length && (char.IsLetterOrDigit(input[position]) || input[position] == '_')) position++;
        return input[start..position];
    }

    private string? TakeCurrency()
    {
        SkipSpace();
        if (position == input.Length) return null;
        var symbol = input[position] switch
        {
            '$' => "$",
            '€' => "€",
            '£' => "£",
            '¥' => "¥",
            _ => null
        };
        if (symbol is not null) position++;
        return symbol;
    }

    private bool Take(char expected)
    {
        SkipSpace();
        if (position >= input.Length || input[position] != expected) return false;
        position++;
        return true;
    }

    private void SkipSpace()
    {
        while (position < input.Length && char.IsWhiteSpace(input[position])) position++;
    }

    private CalculatorException Error(string message) => new($"{message} at {position + 1}");
}

public sealed class CalculatorException(string message) : Exception(message);
